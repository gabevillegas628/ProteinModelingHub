// Email service using Brevo (formerly Sendinblue)

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@example.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Protein Model Organizer';

interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function sendEmail({ to, toName, subject, htmlContent, textContent }: SendEmailParams): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY is not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: SENDER_NAME,
          email: SENDER_EMAIL,
        },
        to: [
          {
            email: to,
            name: toName || to,
          },
        ],
        subject,
        htmlContent,
        textContent: textContent || htmlContent.replace(/<[^>]*>/g, ''),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Brevo API error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetToken: string
): Promise<boolean> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Protein Model Organizer</h1>
      </div>

      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #1e40af; margin-top: 0;">Password Reset Request</h2>

        <p>Hi ${name},</p>

        <p>We received a request to reset the password for your account. Click the button below to create a new password:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="display: inline-block; background-color: #1e40af; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Reset Password
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>

        <p style="color: #6b7280; font-size: 14px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;">${resetUrl}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-bottom: 0;">
          Protein Model Organizer &bull; Waksman Student Scholars Program
        </p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Hi ${name},

We received a request to reset the password for your account.

Click the following link to reset your password:
${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.

---
Protein Model Organizer - Waksman Student Scholars Program
  `.trim();

  return sendEmail({
    to: email,
    toName: name,
    subject: 'Reset Your Password - Protein Model Organizer',
    htmlContent,
    textContent,
  });
}
