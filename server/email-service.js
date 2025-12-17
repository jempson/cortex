// Email Service for Cortex
// Supports multiple providers: SMTP, SendGrid, Mailgun

import nodemailer from 'nodemailer';

/**
 * EmailService - Configurable email delivery for Cortex
 *
 * Environment Variables:
 * - EMAIL_PROVIDER: 'smtp' | 'sendgrid' | 'mailgun' (default: 'smtp')
 *
 * SMTP:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
 *
 * SendGrid:
 * - SENDGRID_API_KEY
 *
 * Mailgun:
 * - MAILGUN_API_KEY, MAILGUN_DOMAIN
 *
 * Common:
 * - EMAIL_FROM: Sender address (default: noreply@cortex.local)
 */
class EmailService {
  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'smtp';
    this.fromAddress = process.env.EMAIL_FROM || 'noreply@cortex.local';
    this.transporter = null;
    this.configured = false;

    this.initialize();
  }

  initialize() {
    try {
      switch (this.provider) {
        case 'smtp':
          this.initializeSMTP();
          break;
        case 'sendgrid':
          this.initializeSendGrid();
          break;
        case 'mailgun':
          this.initializeMailgun();
          break;
        default:
          console.warn(`Unknown email provider: ${this.provider}, falling back to SMTP`);
          this.provider = 'smtp';
          this.initializeSMTP();
      }
    } catch (err) {
      console.error('Email service initialization failed:', err.message);
      this.configured = false;
    }
  }

  initializeSMTP() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true';

    if (!host) {
      console.log('Email service disabled: SMTP_HOST not configured');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    this.configured = true;
    console.log(`Email service enabled (SMTP: ${host}:${port})`);
  }

  initializeSendGrid() {
    const apiKey = process.env.SENDGRID_API_KEY;

    if (!apiKey) {
      console.log('Email service disabled: SENDGRID_API_KEY not configured');
      return;
    }

    // SendGrid uses SMTP relay
    this.transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: apiKey,
      },
    });

    this.configured = true;
    console.log('Email service enabled (SendGrid)');
  }

  initializeMailgun() {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;

    if (!apiKey || !domain) {
      console.log('Email service disabled: MAILGUN_API_KEY or MAILGUN_DOMAIN not configured');
      return;
    }

    // Mailgun SMTP relay (can also use their HTTP API, but SMTP is simpler)
    this.transporter = nodemailer.createTransport({
      host: 'smtp.mailgun.org',
      port: 587,
      secure: false,
      auth: {
        user: `postmaster@${domain}`,
        pass: apiKey,
      },
    });

    this.configured = true;
    console.log(`Email service enabled (Mailgun: ${domain})`);
  }

  /**
   * Check if email service is configured and ready
   */
  isConfigured() {
    return this.configured && this.transporter !== null;
  }

  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain text content (optional, generated from HTML if not provided)
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendEmail({ to, subject, html, text }) {
    if (!this.isConfigured()) {
      console.warn('Email service not configured, skipping email send');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
      });

      console.log(`Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`Failed to send email to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send a password reset email
   * @param {string} email - Recipient email
   * @param {string} token - Reset token
   * @param {string} resetUrl - Full URL for password reset
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendPasswordResetEmail(email, token, resetUrl) {
    const subject = 'Cortex - Password Reset Request';
    const html = `
      <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; padding: 20px; background: #050805; color: #e8e8e8;">
        <h1 style="color: #ffd23f; text-align: center; border-bottom: 1px solid #3a4a3a; padding-bottom: 20px;">CORTEX</h1>
        <h2 style="color: #0ead69;">Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to set a new password:</p>
        <p style="margin: 30px 0; text-align: center;">
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #ffd23f20; border: 1px solid #ffd23f; color: #ffd23f; text-decoration: none; font-family: monospace;">
            RESET PASSWORD
          </a>
        </p>
        <p style="color: #888; font-size: 0.9em;">This link will expire in 1 hour.</p>
        <p style="color: #888; font-size: 0.9em;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #3a4a3a; margin: 30px 0;">
        <p style="color: #666; font-size: 0.8em; text-align: center;">Cortex - Secure Communications</p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send an MFA verification code via email
   * @param {string} email - Recipient email
   * @param {string} code - 6-digit verification code
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendMFACode(email, code) {
    const subject = 'Cortex - Your Verification Code';
    const html = `
      <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; padding: 20px; background: #050805; color: #e8e8e8;">
        <h1 style="color: #ffd23f; text-align: center; border-bottom: 1px solid #3a4a3a; padding-bottom: 20px;">CORTEX</h1>
        <h2 style="color: #0ead69;">Verification Code</h2>
        <p>Your login verification code is:</p>
        <p style="margin: 30px 0; text-align: center;">
          <span style="display: inline-block; padding: 16px 32px; background: #0ead6920; border: 2px solid #0ead69; color: #0ead69; font-size: 2em; letter-spacing: 8px; font-weight: bold;">
            ${code}
          </span>
        </p>
        <p style="color: #888; font-size: 0.9em;">This code will expire in 10 minutes.</p>
        <p style="color: #888; font-size: 0.9em;">If you didn't request this code, your account may be at risk. Consider changing your password.</p>
        <hr style="border: none; border-top: 1px solid #3a4a3a; margin: 30px 0;">
        <p style="color: #666; font-size: 0.8em; text-align: center;">Cortex - Secure Communications</p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send a temporary password email (for admin password reset)
   * @param {string} email - Recipient email
   * @param {string} tempPassword - Temporary password
   * @param {string} adminName - Name of admin who initiated reset
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendTempPasswordEmail(email, tempPassword, adminName) {
    const subject = 'Cortex - Your Password Has Been Reset';
    const html = `
      <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; padding: 20px; background: #050805; color: #e8e8e8;">
        <h1 style="color: #ffd23f; text-align: center; border-bottom: 1px solid #3a4a3a; padding-bottom: 20px;">CORTEX</h1>
        <h2 style="color: #0ead69;">Password Reset by Administrator</h2>
        <p>An administrator (${adminName}) has reset your password.</p>
        <p>Your temporary password is:</p>
        <p style="margin: 30px 0; text-align: center;">
          <span style="display: inline-block; padding: 16px 32px; background: #ffd23f20; border: 2px solid #ffd23f; color: #ffd23f; font-size: 1.2em; font-family: monospace;">
            ${tempPassword}
          </span>
        </p>
        <p style="color: #ff6b35; font-weight: bold;">You will be required to change this password on your next login.</p>
        <hr style="border: none; border-top: 1px solid #3a4a3a; margin: 30px 0;">
        <p style="color: #666; font-size: 0.8em; text-align: center;">Cortex - Secure Communications</p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send a warning notification email
   * @param {string} email - Recipient email
   * @param {string} reason - Warning reason
   * @param {string} adminName - Name of admin who issued warning
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendWarningEmail(email, reason, adminName) {
    const subject = 'Cortex - Warning Notification';
    const html = `
      <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; padding: 20px; background: #050805; color: #e8e8e8;">
        <h1 style="color: #ffd23f; text-align: center; border-bottom: 1px solid #3a4a3a; padding-bottom: 20px;">CORTEX</h1>
        <h2 style="color: #ff6b35;">Account Warning</h2>
        <p>You have received a warning from a moderator:</p>
        <div style="margin: 20px 0; padding: 16px; background: #ff6b3510; border-left: 4px solid #ff6b35;">
          <p style="margin: 0; color: #ff6b35;">${reason}</p>
        </div>
        <p style="color: #888; font-size: 0.9em;">Please review our community guidelines to avoid further action.</p>
        <hr style="border: none; border-top: 1px solid #3a4a3a; margin: 30px 0;">
        <p style="color: #666; font-size: 0.8em; text-align: center;">Cortex - Secure Communications</p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Strip HTML tags to create plain text version
   * @param {string} html - HTML content
   * @returns {string} Plain text
   */
  stripHtml(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verify the email configuration by sending a test email
   * @param {string} testEmail - Email to send test to
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async verifyConfiguration(testEmail) {
    const subject = 'Cortex - Email Configuration Test';
    const html = `
      <div style="font-family: 'Courier New', monospace; padding: 20px;">
        <h1 style="color: #0ead69;">Email Configuration Successful</h1>
        <p>This is a test email from Cortex to verify your email configuration.</p>
        <p>Provider: ${this.provider}</p>
        <p>From: ${this.fromAddress}</p>
        <p>Time: ${new Date().toISOString()}</p>
      </div>
    `;

    return this.sendEmail({ to: testEmail, subject, html });
  }
}

// Singleton instance
let emailServiceInstance = null;

export function getEmailService() {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}

export { EmailService };
