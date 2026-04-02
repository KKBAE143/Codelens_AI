import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";
const FROM_EMAIL = process.env.EMAIL_FROM || "CodeLens AI <noreply@codelens.ai>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!resend) return false;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.warn("[Email] Resend API error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("[Email] Failed to send:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function sendCourseCompletionEmail(
  userEmail: string,
  userName: string,
  courseName: string,
  courseUrl: string,
): Promise<boolean> {
  return sendEmail({
    to: userEmail,
    subject: `You completed the ${courseName} course!`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <span style="color: #E85D30; font-size: 24px; font-weight: 700;">&#9673; CodeLens AI</span>
        </div>
        <h1 style="font-size: 1.5rem; color: #2C2C2A; margin-bottom: 0.5rem;">
          Congratulations, ${userName}!
        </h1>
        <p style="color: #6B6B69; font-size: 1rem; line-height: 1.6; margin-bottom: 1.5rem;">
          You've completed the <strong>${courseName}</strong> course. Great work understanding this codebase!
        </p>
        <a href="${courseUrl}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #E85D30; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
          Review Course
        </a>
        <hr style="border: none; border-top: 1px solid #E5E2DB; margin: 2rem 0;" />
        <p style="color: #9A9A96; font-size: 0.75rem;">
          You received this because email notifications are enabled.
          <a href="${APP_URL}/dashboard" style="color: #6B6B69;">Manage preferences</a>
        </p>
      </div>
    `,
  });
}

export async function sendCourseGeneratedEmail(
  userEmail: string,
  userName: string,
  courseName: string,
  courseUrl: string,
): Promise<boolean> {
  return sendEmail({
    to: userEmail,
    subject: `Your ${courseName} course is ready!`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <span style="color: #E85D30; font-size: 24px; font-weight: 700;">&#9673; CodeLens AI</span>
        </div>
        <h1 style="font-size: 1.5rem; color: #2C2C2A; margin-bottom: 0.5rem;">
          Your course is ready, ${userName}!
        </h1>
        <p style="color: #6B6B69; font-size: 1rem; line-height: 1.6; margin-bottom: 1.5rem;">
          The AI-generated course for <strong>${courseName}</strong> has finished generating. Start learning now!
        </p>
        <a href="${courseUrl}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #E85D30; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
          Start Course
        </a>
        <hr style="border: none; border-top: 1px solid #E5E2DB; margin: 2rem 0;" />
        <p style="color: #9A9A96; font-size: 0.75rem;">
          You received this because email notifications are enabled.
          <a href="${APP_URL}/dashboard" style="color: #6B6B69;">Manage preferences</a>
        </p>
      </div>
    `,
  });
}

export async function sendCourseRegeneratedEmail(
  to: string,
  userName: string,
  courseName: string,
  courseUrl: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Your ${courseName} course has been updated!`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <span style="color: #E85D30; font-size: 24px; font-weight: 700;">&#9673; CodeLens AI</span>
        </div>
        <h1 style="font-size: 1.5rem; color: #2C2C2A; margin-bottom: 0.5rem;">
          Course updated, ${userName}!
        </h1>
        <p style="color: #6B6B69; font-size: 1rem; line-height: 1.6; margin-bottom: 1.5rem;">
          The <strong>${courseName}</strong> course has been automatically regenerated based on the latest codebase changes. Check out what's new!
        </p>
        <a href="${courseUrl}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #E85D30; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
          View Updated Course
        </a>
        <hr style="border: none; border-top: 1px solid #E5E2DB; margin: 2rem 0;" />
        <p style="color: #9A9A96; font-size: 0.75rem;">
          You received this because email notifications are enabled.
          <a href="${APP_URL}/dashboard" style="color: #6B6B69;">Manage preferences</a>
        </p>
      </div>
    `,
  });
}

export async function sendCourseGenerationErrorEmail(
  to: string,
  userName: string,
  courseName: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Issue generating ${courseName} course`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <span style="color: #E85D30; font-size: 24px; font-weight: 700;">&#9673; CodeLens AI</span>
        </div>
        <h1 style="font-size: 1.5rem; color: #2C2C2A; margin-bottom: 0.5rem;">
          Course generation failed, ${userName}
        </h1>
        <p style="color: #6B6B69; font-size: 1rem; line-height: 1.6; margin-bottom: 1.5rem;">
          We encountered an error while generating the <strong>${courseName}</strong> course. Please try again from your dashboard. If the issue persists, contact support.
        </p>
        <a href="${APP_URL}/dashboard" style="display: inline-block; padding: 0.75rem 1.5rem; background: #E85D30; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
          Go to Dashboard
        </a>
        <hr style="border: none; border-top: 1px solid #E5E2DB; margin: 2rem 0;" />
        <p style="color: #9A9A96; font-size: 0.75rem;">
          You received this because email notifications are enabled.
          <a href="${APP_URL}/dashboard" style="color: #6B6B69;">Manage preferences</a>
        </p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(
  to: string,
  userName: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Welcome to CodeLens AI!",
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <span style="color: #E85D30; font-size: 24px; font-weight: 700;">&#9673; CodeLens AI</span>
        </div>
        <h1 style="font-size: 1.5rem; color: #2C2C2A; margin-bottom: 0.5rem;">
          Welcome to CodeLens AI, ${userName}!
        </h1>
        <p style="color: #6B6B69; font-size: 1rem; line-height: 1.6; margin-bottom: 1.5rem;">
          Turn any GitHub repository into an interactive AI-generated course. Paste a repo URL, pick your audience type, and let AI do the rest.
        </p>
        <a href="${APP_URL}/dashboard" style="display: inline-block; padding: 0.75rem 1.5rem; background: #E85D30; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
          Create Your First Course
        </a>
        <hr style="border: none; border-top: 1px solid #E5E2DB; margin: 2rem 0;" />
        <p style="color: #9A9A96; font-size: 0.75rem;">
          You received this because you signed up for CodeLens AI.
          <a href="${APP_URL}/dashboard" style="color: #6B6B69;">Manage preferences</a>
        </p>
      </div>
    `,
  });
}

export async function sendMonthlyUsageWarningEmail(
  to: string,
  userName: string,
  used: number,
  limit: number,
): Promise<boolean> {
  const remaining = limit - used;
  const percentage = Math.round((used / limit) * 100);

  return sendEmail({
    to,
    subject: `You've used ${percentage}% of your monthly CodeLens AI generations`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <span style="color: #E85D30; font-size: 24px; font-weight: 700;">&#9673; CodeLens AI</span>
        </div>
        <h1 style="font-size: 1.5rem; color: #2C2C2A; margin-bottom: 0.5rem;">
          Usage alert, ${userName}
        </h1>
        <p style="color: #6B6B69; font-size: 1rem; line-height: 1.6; margin-bottom: 1.5rem;">
          You've used <strong>${used} out of ${limit}</strong> course generations this month. You have <strong>${remaining}</strong> remaining.
        </p>
        <div style="background: #F5F3EE; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
          <div style="background: #E5E2DB; border-radius: 4px; height: 8px; overflow: hidden;">
            <div style="background: #E85D30; height: 100%; width: ${percentage}%;"></div>
          </div>
          <p style="color: #9A9A96; font-size: 0.75rem; margin-top: 0.5rem; margin-bottom: 0;">
            ${percentage}% used
          </p>
        </div>
        <a href="${APP_URL}/settings/billing" style="display: inline-block; padding: 0.75rem 1.5rem; background: #E85D30; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
          Upgrade to Pro
        </a>
        <hr style="border: none; border-top: 1px solid #E5E2DB; margin: 2rem 0;" />
        <p style="color: #9A9A96; font-size: 0.75rem;">
          You received this because email notifications are enabled.
          <a href="${APP_URL}/dashboard" style="color: #6B6B69;">Manage preferences</a>
        </p>
      </div>
    `,
  });
}
