import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | CodeLens AI",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: April 3, 2026</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using CodeLens AI (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            CodeLens AI is a platform that transforms GitHub repositories into interactive, AI-generated learning courses. The Service includes course generation, viewing, progress tracking, and related features.
          </p>
        </section>

        <section>
          <h2>3. User Accounts</h2>
          <p>
            To use certain features, you must authenticate via GitHub OAuth. You are responsible for maintaining the security of your account and for all activities that occur under your account.
          </p>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Interfere with or disrupt the Service or its infrastructure</li>
            <li>Use automated tools to scrape or extract data from the Service beyond normal API usage</li>
            <li>Violate any applicable laws or regulations</li>
          </ul>
        </section>

        <section>
          <h2>5. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are owned by CodeLens AI. Courses generated from your repositories remain associated with your account. You retain all rights to your original source code.
          </p>
        </section>

        <section>
          <h2>6. Subscriptions and Billing</h2>
          <p>
            Some features require a paid subscription. Billing is handled through Stripe. You can cancel your subscription at any time. Refunds are handled on a case-by-case basis.
          </p>
          <ul>
            <li><strong>Free tier:</strong> Limited course generations per month</li>
            <li><strong>Pro tier:</strong> Unlimited course generations and additional features</li>
            <li><strong>Team tier:</strong> Organisation features, learning paths, and team management</li>
          </ul>
        </section>

        <section>
          <h2>7. AI-Generated Content</h2>
          <p>
            Courses are generated using AI and may contain inaccuracies. The Service provides AI safety maps and warnings where applicable, but users should verify critical information independently. AI-generated content is provided &ldquo;as is&rdquo; without warranty of accuracy.
          </p>
        </section>

        <section>
          <h2>8. Privacy</h2>
          <p>
            Your use of the Service is also governed by our <Link href="/privacy">Privacy Policy</Link>. By using the Service, you consent to the collection and use of information as described in the Privacy Policy.
          </p>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            CodeLens AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Service.
          </p>
        </section>

        <section>
          <h2>10. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to the Service at any time, with or without cause and with or without notice. Upon termination, your right to use the Service will immediately cease.
          </p>
        </section>

        <section>
          <h2>11. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            If you have questions about these Terms of Service, please contact us through our GitHub repository.
          </p>
        </section>
      </div>
    </main>
  );
}
