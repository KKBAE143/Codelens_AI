const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";
const FROM_EMAIL = process.env.EMAIL_FROM || "CodeLens AI <noreply@codelens.ai>";

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });
    return res.ok;
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
