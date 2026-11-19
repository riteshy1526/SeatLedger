const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { sendEmail, sendWhatsApp, getReminderDeliveryConfiguration } = require('../services/notification.service');
const ReminderLog = require('../models/ReminderLog');
const FeePayment = require('../models/FeePayment');
const Library = require('../models/Library');
const { ensureMonthlyFeeRecords } = require('../utils/monthlyFeeProvisioning');
const {
  REMINDER_TIME_ZONE,
  getDelayUntilNextReminderScan,
  getLocalDateKey,
  isReminderDueToday,
} = require('../utils/reminderSchedule');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REMINDER_SCHEDULE = '0 9 * * *';

let redisClient = null;
let reminderQueue = null;
let reminderWorker = null;
let isRedisAvailable = false;
let schedulerMode = 'Starting';
let inProcessScanTimer = null;
let dailyScheduleRegistered = false;

function getPublicBaseUrl() {
  const configuredUrl = process.env.APP_BASE_URL;
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function getReminderSystemStatus() {
  return {
    schedulerMode,
    schedulerActive: schedulerMode !== 'Starting',
    redisAvailable: isRedisAvailable,
    appBaseUrlConfigured: Boolean(getPublicBaseUrl()),
    ...getReminderDeliveryConfiguration(),
  };
}

function stopInProcessScheduler() {
  if (inProcessScanTimer) {
    clearTimeout(inProcessScanTimer);
    inProcessScanTimer = null;
  }
}

function startInProcessScheduler() {
  if (inProcessScanTimer) return;

  schedulerMode = 'In-process fallback';
  inProcessScanTimer = setTimeout(async () => {
    inProcessScanTimer = null;
    try {
      const result = await scanAutomaticDueReminders();
      console.log(`[Reminder Scheduler] Scanned due reminders: ${result.queuedCount} queued.`);
    } catch (error) {
      console.error('[Reminder Scheduler] Daily scan failed:', error.message);
    } finally {
      if (!isRedisAvailable) startInProcessScheduler();
    }
  }, getDelayUntilNextReminderScan());

  if (typeof inProcessScanTimer.unref === 'function') inProcessScanTimer.unref();
}

function formatDueDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: REMINDER_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getDaysBeforeDue(library) {
  const configuredDays = Number(library.settings?.reminderDaysBeforeDue);
  return Number.isInteger(configuredDays) && configuredDays >= 0 ? configuredDays : 3;
}

async function scanAutomaticDueReminders(now = new Date()) {
  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) {
    console.warn('[Reminder Scheduler] Set APP_BASE_URL to enable automatic payment reminders.');
    return { queuedCount: 0, skipped: 'APP_BASE_URL is not configured' };
  }

  const { emailConfigured, whatsAppConfigured } = getReminderDeliveryConfiguration();
  const libraries = await Library.find({});
  const todayKey = getLocalDateKey(now);
  const [year, month] = todayKey.split('-').map(Number);
  let queuedCount = 0;

  for (const library of libraries) {
    const settings = library.settings || {};
    const channels = [];
    if (settings.enableEmailReminder !== false && emailConfigured) channels.push('EMAIL');
    if (settings.enableWhatsappReminder !== false && whatsAppConfigured) channels.push('WHATSAPP');
    if (channels.length === 0) continue;

    await ensureMonthlyFeeRecords(library._id, library, month, year);
    const fees = await FeePayment.find({
      libraryId: library._id,
      month,
      year,
      status: { $in: ['Due', 'Partial'] },
      balance: { $gt: 0 },
    }).populate('studentId');
    const daysBeforeDue = getDaysBeforeDue(library);

    for (const fee of fees) {
      const student = fee.studentId;
      if (!student || student.status !== 'Active' || !fee.dueDate) continue;
      if (!isReminderDueToday(fee.dueDate, daysBeforeDue, now)) continue;

      for (const channel of channels) {
        const contact = channel === 'EMAIL' ? student.email : student.contactNo;
        if (!contact) continue;

        const automationKey = `auto_${fee._id}_${channel}_${todayKey.replace(/-/g, '')}`;
        const jobId = automationKey;
        try {
          await ReminderLog.create({
            libraryId: library._id,
            studentId: student._id,
            feeId: fee._id,
            channel,
            recipient: contact,
            studentName: student.studentName,
            amount: fee.balance,
            messageBody: 'Scheduled fee reminder queued for dispatch.',
            status: 'Queued',
            jobId,
            automationKey,
          });
        } catch (error) {
          if (error.code === 11000) continue;
          throw error;
        }

        try {
          await addReminderJob({
            libraryId: library._id,
            studentId: student._id,
            feeId: fee._id,
            studentName: student.studentName,
            channel,
            contact,
            amount: fee.balance,
            dueDate: formatDueDate(fee.dueDate),
            libraryName: library.name || 'SeatLedger Library',
            paymentLink: `${publicBaseUrl}/pay/${fee._id}`,
            automationKey,
            jobId,
          });
          queuedCount += 1;
        } catch (error) {
          await ReminderLog.updateOne({ automationKey }, {
            $set: { status: 'Failed', errorMessage: error.message },
          });
          console.error(`[Reminder Scheduler] Failed to queue ${channel} reminder:`, error.message);
        }
      }
    }
  }

  return { queuedCount, date: todayKey };
}

const processReminderJob = async (jobData) => {
  const {
    libraryId,
    studentId,
    feeId,
    studentName,
    channel,
    contact,
    amount,
    dueDate,
    libraryName,
    paymentLink,
  } = jobData;

  let result = null;
  let status = 'Sent';
  let errorMessage = '';

  try {
    if (channel === 'WHATSAPP') {
      result = await sendWhatsApp({
        phone: contact,
        studentName,
        libraryName,
        amount,
        dueDate,
        paymentLink,
      });
    } else if (channel === 'EMAIL') {
      const formattedHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #4f46e5;">${libraryName} - Library Fee Reminder</h2>
          <p>Dear <strong>${studentName}</strong>,</p>
          <p>This is a reminder that your monthly fee of <strong>₹${amount}</strong> is pending for the due date <strong>${dueDate}</strong>.</p>
          <p>Please clear your fee to maintain uninterrupted seat reservation and library access.</p>
          ${paymentLink ? `<p><a href="${paymentLink}" style="background-color: #4f46e5; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">Pay Fee Online Now</a></p>` : ''}
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;" />
          <p style="font-size: 12px; color: #64748b;">SeatLedger SaaS Platform</p>
        </div>
      `;

      result = await sendEmail({
        to: contact,
        subject: `Fee Due Reminder - ${libraryName}`,
        html: formattedHtml,
        text: `Dear ${studentName}, your fee of Rs. ${amount} is due on ${dueDate}. Please pay to keep your seat.`,
      });
    } else {
      throw new Error(`Unsupported reminder channel: ${channel}`);
    }

    if (result?.simulated) status = 'Simulated';
  } catch (err) {
    status = 'Failed';
    errorMessage = err.message;
    console.error(`[Reminder Error] Failed to send ${channel} to ${contact}:`, err.message);
  }

  const logData = {
    libraryId,
    studentId,
    feeId: feeId || null,
    channel,
    recipient: contact,
    studentName,
    amount,
    messageBody: channel === 'WHATSAPP' ? (result?.message || 'WhatsApp Reminder') : 'Email Reminder',
    status,
    errorMessage,
    jobId: jobData.jobId || `job_${Date.now()}`,
    ...(jobData.automationKey ? { automationKey: jobData.automationKey } : {}),
    sentAt: new Date(),
  };

  try {
    if (jobData.automationKey) {
      await ReminderLog.updateOne(
        { automationKey: jobData.automationKey },
        { $set: logData },
        { upsert: true }
      );
    } else {
      await ReminderLog.create(logData);
    }
  } catch (dbErr) {
    console.warn('[ReminderLog] DB write failed:', dbErr.message);
  }

  return { success: status === 'Sent', status, recipient: contact };
};

async function registerDailyReminderSchedule() {
  if (!reminderQueue) return;
  if (dailyScheduleRegistered) {
    schedulerMode = 'BullMQ (Redis)';
    stopInProcessScheduler();
    return;
  }

  try {
    await reminderQueue.add('scan-due-reminders', {}, {
      jobId: 'seatledger-daily-reminder-scan',
      repeat: { pattern: REMINDER_SCHEDULE, tz: REMINDER_TIME_ZONE },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    dailyScheduleRegistered = true;
    schedulerMode = 'BullMQ (Redis)';
    stopInProcessScheduler();
  } catch (error) {
    console.error('[Reminder Scheduler] Could not register the daily Redis schedule:', error.message);
    startInProcessScheduler();
  }
}

function initBullMQ() {
  if (!reminderQueue) {
    try {
      reminderQueue = new Queue('seatledger-reminders', { connection: redisClient });
      reminderWorker = new Worker(
        'seatledger-reminders',
        async (job) => {
          if (job.name === 'scan-due-reminders') {
            return scanAutomaticDueReminders();
          }
          return processReminderJob({ ...job.data, jobId: job.id });
        },
        { connection: redisClient, concurrency: 5 }
      );

      reminderWorker.on('completed', (job) => {
        console.log(`[BullMQ Worker] Job ${job.id} completed.`);
      });

      reminderWorker.on('failed', (job, err) => {
        console.error(`[BullMQ Worker] Job ${job?.id} failed:`, err.message);
      });
    } catch (error) {
      console.warn('[BullMQ] Could not initialize Worker:', error.message);
      startInProcessScheduler();
      return;
    }
  }

  registerDailyReminderSchedule();
}

const addReminderJob = async (jobData) => {
  if (isRedisAvailable && reminderQueue) {
    try {
      const job = await reminderQueue.add('send-reminder', jobData, {
        jobId: jobData.jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
      return { queued: true, type: 'BullMQ', jobId: job.id };
    } catch (err) {
      console.warn('[BullMQ] Queue add failed, falling back to direct async worker:', err.message);
    }
  }

  const jobId = jobData.jobId || `async_${Date.now()}`;
  setImmediate(async () => {
    await processReminderJob({ ...jobData, jobId });
  });

  return { queued: true, type: 'DirectAsyncFallback', jobId };
};

try {
  redisClient = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
    connectTimeout: 2000,
    retryStrategy: (times) => (times > 2 ? null : 1000),
  });

  redisClient.on('connect', () => {
    console.log(`[BullMQ] Redis connected on ${REDIS_HOST}:${REDIS_PORT}`);
    isRedisAvailable = true;
    initBullMQ();
  });

  redisClient.on('error', (err) => {
    if (isRedisAvailable) {
      console.warn('[BullMQ] Redis connection lost:', err.message);
    }
    isRedisAvailable = false;
    schedulerMode = 'In-process fallback';
    startInProcessScheduler();
  });
} catch (error) {
  console.warn('[BullMQ] Redis client init failed:', error.message);
  startInProcessScheduler();
}

module.exports = {
  addReminderJob,
  getReminderSystemStatus,
  processReminderJob,
  scanAutomaticDueReminders,
};
