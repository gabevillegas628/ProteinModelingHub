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

interface SubmissionInfo {
  modelName: string;
  status: 'DRAFT' | 'SUBMITTED' | 'NEEDS_REVISION' | 'APPROVED';
  fileName: string;
  submittedAt: string;
}

interface ReviewRequestParams {
  instructorEmail: string;
  instructorName: string;
  groupName: string;
  proteinName: string;
  proteinPdbId: string;
  studentNames: string[];
  submissions: SubmissionInfo[];
  dashboardUrl: string;
}

export async function sendReviewRequestEmail({
  instructorEmail,
  instructorName,
  groupName,
  proteinName,
  proteinPdbId,
  studentNames,
  submissions,
  dashboardUrl,
}: ReviewRequestParams): Promise<boolean> {
  const statusColors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: '#f3f4f6', text: '#4b5563' },
    SUBMITTED: { bg: '#dbeafe', text: '#1d4ed8' },
    NEEDS_REVISION: { bg: '#fef3c7', text: '#b45309' },
    APPROVED: { bg: '#d1fae5', text: '#047857' },
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    NEEDS_REVISION: 'Needs Revision',
    APPROVED: 'Approved',
  };

  const submissionRows = submissions
    .map((s) => {
      const colors = statusColors[s.status] || statusColors.DRAFT;
      const label = statusLabels[s.status] || s.status;
      const date = new Date(s.submittedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${s.modelName}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
            <span style="background-color: ${colors.bg}; color: ${colors.text}; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;">
              ${label}
            </span>
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">${date}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Review Request</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Protein Model Organizer</p>
      </div>

      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0;">Hi ${instructorName},</p>

        <p><strong>${groupName}</strong> has requested your review of their model submissions.</p>

        <!-- Group Info Card -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <div style="background: #1e40af; color: white; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; margin-right: 12px;">
              ${proteinPdbId.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div style="font-weight: 600; color: #1e293b;">${proteinName}</div>
              <div style="font-size: 13px; color: #64748b;">PDB: ${proteinPdbId}</div>
            </div>
          </div>
          <div style="font-size: 14px; color: #475569;">
            <strong>Students:</strong> ${studentNames.join(', ')}
          </div>
        </div>

        <!-- Submissions Table -->
        <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 12px;">Current Submissions</h3>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #475569; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Model</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #475569; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #475569; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Submitted</th>
            </tr>
          </thead>
          <tbody>
            ${submissionRows}
          </tbody>
        </table>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background-color: #1e40af; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            View Submissions
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-bottom: 0;">
          Protein Model Organizer &bull; Waksman Student Scholars Program
        </p>
      </div>
    </body>
    </html>
  `;

  const submissionText = submissions
    .map((s) => {
      const label = statusLabels[s.status] || s.status;
      const date = new Date(s.submittedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `  - ${s.modelName}: ${label} (${date})`;
    })
    .join('\n');

  const textContent = `
Hi ${instructorName},

${groupName} has requested your review of their model submissions.

Group: ${groupName}
Protein: ${proteinName} (${proteinPdbId})
Students: ${studentNames.join(', ')}

Current Submissions:
${submissionText}

View submissions: ${dashboardUrl}

---
Protein Model Organizer - Waksman Student Scholars Program
  `.trim();

  return sendEmail({
    to: instructorEmail,
    toName: instructorName,
    subject: `Review Request: ${groupName} - ${proteinName}`,
    htmlContent,
    textContent,
  });
}
