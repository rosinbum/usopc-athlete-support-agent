import Link from "next/link";
import {
  Trophy,
  Scale,
  ShieldAlert,
  FlaskConical,
  CheckCircle,
  Building2,
  Users,
  Shield,
  MessageCircle,
  FileSearch,
} from "lucide-react";
import { auth } from "../auth.js";
import { AccessRequestForm } from "../components/landing/AccessRequestForm";

const categories = [
  {
    id: "team_selection",
    title: "Team Selection",
    description:
      "Selection procedures, qualification criteria, Olympic Trials, and roster decisions",
    icon: Trophy,
  },
  {
    id: "dispute_resolution",
    title: "Dispute Resolution",
    description:
      "Section 9 arbitration, grievance procedures, appeals, and athlete protections",
    icon: Scale,
  },
  {
    id: "safesport",
    title: "SafeSport",
    description:
      "Abuse prevention and response, misconduct reporting, and athlete safety",
    icon: ShieldAlert,
  },
  {
    id: "anti_doping",
    title: "Anti-Doping",
    description:
      "USADA testing, TUEs, whereabouts, prohibited substances, and results management",
    icon: FlaskConical,
  },
  {
    id: "eligibility",
    title: "Eligibility",
    description:
      "Citizenship requirements, age limits, qualification standards, and classification",
    icon: CheckCircle,
  },
  {
    id: "governance",
    title: "Governance",
    description:
      "USOPC and NGB structure, bylaws, certification, and organizational obligations",
    icon: Building2,
  },
  {
    id: "athlete_rights",
    title: "Athlete Rights",
    description:
      "Representation, Athletes' Commission, marketing rights, and the Athlete Bill of Rights",
    icon: Users,
  },
];

const steps = [
  {
    number: 1,
    title: "Ask a Question",
    description:
      "Type your question about governance, team selection, dispute resolution, or any athlete rights topic.",
    icon: MessageCircle,
  },
  {
    number: 2,
    title: "AI Searches Official Sources",
    description:
      "The system searches USOPC bylaws, NGB policies, Ted Stevens Act, SafeSport Code, and more.",
    icon: FileSearch,
  },
  {
    number: 3,
    title: "Get Cited Answers",
    description:
      "Receive clear answers with direct citations to the governing documents so you can verify everything.",
    icon: Shield,
  },
];

export default async function HomePage() {
  const session = await auth();
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="absolute top-0 left-0 right-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <span className="text-lg font-bold text-white tracking-tight">
            USOPC Athlete Support
          </span>
          <Link
            href={session ? "/chat" : "/auth/login?callbackUrl=/chat"}
            className="text-sm font-medium text-white/90 hover:text-white transition-colors"
          >
            {session ? "Go to Chat" : "Sign In"}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-usopc-navy pt-28 pb-20 overflow-hidden">
        {/* Subtle diagonal bottom edge */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 bg-white"
          style={{ clipPath: "polygon(0 100%, 100% 0, 100% 100%)" }}
        />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
              Know Your Rights.
              <br />
              Navigate the System.
            </h1>
            <p className="mt-5 text-lg text-white/80 leading-relaxed">
              AI-powered governance and compliance guidance for U.S. Olympic and
              Paralympic athletes. Get answers grounded in official USOPC
              bylaws, NGB policies, and federal law.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              {session ? (
                <Link
                  href="/chat"
                  className="inline-flex items-center rounded-lg bg-usopc-red px-7 py-3.5 text-white font-semibold hover:bg-usopc-red-dark transition-colors"
                >
                  Go to Chat
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth/login?callbackUrl=/chat"
                    className="inline-flex items-center rounded-lg bg-usopc-red px-7 py-3.5 text-white font-semibold hover:bg-usopc-red-dark transition-colors"
                  >
                    Sign In
                  </Link>
                  <a
                    href="#request-access"
                    className="inline-flex items-center rounded-lg border-2 border-white/30 px-7 py-3.5 text-white font-semibold hover:border-white/60 transition-colors"
                  >
                    Request Access
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Topic Grid */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-usopc-gray-900 mb-2">
            What It Covers
          </h2>
          <p className="text-usopc-gray-500 mb-8 max-w-2xl">
            Comprehensive coverage across all major areas of athlete governance
            and compliance.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.id}
                  href={`/chat?topic=${cat.id}`}
                  className="group border border-usopc-gray-200 rounded-lg p-5 pl-6 border-l-4 border-l-usopc-red hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-usopc-navy/10">
                      <Icon className="w-4.5 h-4.5 text-usopc-navy" />
                    </div>
                    <h3 className="font-semibold text-usopc-gray-900">
                      {cat.title}
                    </h3>
                  </div>
                  <p className="text-sm text-usopc-gray-500 leading-relaxed">
                    {cat.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-usopc-gray-50">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-usopc-gray-900 mb-10 text-center">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border-2 border-usopc-gold bg-white mb-4">
                    <Icon className="w-6 h-6 text-usopc-navy" />
                  </div>
                  <div className="text-xs font-bold text-usopc-gold uppercase tracking-wider mb-1">
                    Step {step.number}
                  </div>
                  <h3 className="font-semibold text-usopc-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-usopc-gray-500 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Access Request Form — hidden for signed-in users */}
      {!session && (
        <section id="request-access" className="py-16 bg-white">
          <div className="mx-auto max-w-xl px-6">
            <h2 className="text-2xl font-bold text-usopc-gray-900 mb-2 text-center">
              Request Access
            </h2>
            <p className="text-usopc-gray-500 mb-8 text-center">
              This tool is currently available by invitation. Submit your
              details and we&apos;ll review your request.
            </p>
            <AccessRequestForm />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-usopc-navy">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-white/60">
          <p>
            This tool provides educational information only and does not
            constitute legal advice. For urgent safety concerns, contact the{" "}
            <a
              href="https://uscenterforsafesport.org"
              className="underline text-white/80 hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              U.S. Center for SafeSport
            </a>{" "}
            or call 911.
          </p>
          <p className="mt-3 text-white/40">
            &copy; {new Date().getFullYear()} Rosinbum, inc. Not an official
            USOPC product.
          </p>
        </div>
      </footer>
    </div>
  );
}
