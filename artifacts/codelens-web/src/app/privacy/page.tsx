import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | CodeLens AI",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: April 3, 2026</p>

        <section>
          <h2>1. Information We Collect</h2>

          <h3>Account Information</h3>
          <p>
            When you sign in with GitHub, we collect your GitHub username, display name, email address, and avatar URL. This information is used to create and manage your account.
          </p>

          <h3>Repository Data</h3>
          <p>
            When you generate a course, we access your specified GitHub repository to read its file structure and source code. This data is processed by our AI pipeline to generate course content. We do not store raw source code beyond what is needed for course generation.
          </p>

          <h3>Usage Data</h3>
          <p>
            We collect information about how you use the Service, including courses generated, modules completed, quiz scores, and feature usage. This helps us improve the Service and provide progress tracking.
          </p>
        </section>

        <section>
          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>To provide and maintain the Service</li>
            <li>To generate AI-powered courses from your repositories</li>
            <li>To track your learning progress and provide personalised experiences</li>
            <li>To process payments through Stripe</li>
            <li>To send service-related notifications (e.g., course completion, webhook updates)</li>
            <li>To improve and optimise the Service</li>
          </ul>
        </section>

        <section>
          <h2>3. Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul>
            <li><strong>GitHub:</strong> Authentication and repository access</li>
            <li><strong>Cloudflare Workers AI:</strong> AI-powered course content generation</li>
            <li><strong>Stripe:</strong> Payment processing for subscriptions</li>
            <li><strong>Neon:</strong> PostgreSQL database hosting</li>
          </ul>
          <p>
            Each of these services has its own privacy policy. We encourage you to review them.
          </p>
        </section>

        <section>
          <h2>4. Data Storage and Security</h2>
          <p>
            Your data is stored in a PostgreSQL database hosted on Neon. We use encrypted connections (SSL/TLS) for all database communications. GitHub access tokens are encrypted at rest. Session cookies are httpOnly and secure.
          </p>
        </section>

        <section>
          <h2>5. Data Sharing</h2>
          <p>
            We do not sell your personal information. We may share data only in the following cases:
          </p>
          <ul>
            <li>With your consent</li>
            <li>To comply with legal obligations</li>
            <li>To protect the rights, safety, or property of CodeLens AI or its users</li>
            <li>With service providers who assist in operating the Service (as listed above)</li>
          </ul>
        </section>

        <section>
          <h2>6. Public Courses</h2>
          <p>
            If you mark a course as public, its content (but not your source code) will be visible to other users through the explore page and share links. You can change a course&rsquo;s visibility at any time.
          </p>
        </section>

        <section>
          <h2>7. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. Course data is retained until you delete it. You can delete individual courses from your dashboard. Soft-deleted courses are permanently removed after 30 days.
          </p>
        </section>

        <section>
          <h2>8. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Export your course data</li>
            <li>Revoke GitHub access at any time through your GitHub settings</li>
          </ul>
        </section>

        <section>
          <h2>9. Cookies</h2>
          <p>
            We use essential cookies for session management (authentication). We do not use tracking cookies or third-party analytics cookies.
          </p>
        </section>

        <section>
          <h2>10. Children&rsquo;s Privacy</h2>
          <p>
            The Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children.
          </p>
        </section>

        <section>
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on the Service.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us through our GitHub repository.
          </p>
        </section>

        <p style={{ marginTop: "2rem", fontSize: "0.9em", color: "var(--text-tertiary)" }}>
          Also see our <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>
    </main>
  );
}
