import { FC, FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Gavel, BookOpen, ChevronRight, Star, MapPin, PhoneCall, Calendar, FileText, BellRing, Users } from 'lucide-react';
import { lawyersApi } from '@/services/api';

const DEFAULT_CASE_TYPE_OPTIONS = [
  'Family Law',
  'Criminal Law',
  'Corporate Law',
  'Property Law',
  'Civil Litigation',
  'Tax Law',
  'Consumer Rights',
  'Women Rights',
];

const sortAlphabetically = (items: string[]) => [...items].sort((a, b) => a.localeCompare(b));

const HomePage: FC = () => {
  const navigate = useNavigate();
  const [location, setLocation] = useState('');
  const [caseType, setCaseType] = useState('');
  const [caseTypeOptions, setCaseTypeOptions] = useState<string[]>(sortAlphabetically(DEFAULT_CASE_TYPE_OPTIONS));

  useEffect(() => {
    let isMounted = true;

    const fetchCaseTypes = async () => {
      try {
        const response = await lawyersApi.getAll({ page: 1, limit: 200 });
        const payload = response.data || {};
        const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.data) ? payload.data : [];

        const serverOptions = new Set<string>();

        const fromFilters = payload?.filters?.specializations;
        if (Array.isArray(fromFilters)) {
          fromFilters.forEach((item: unknown) => {
            if (typeof item === 'string' && item.trim()) {
              serverOptions.add(item.trim());
            }
          });
        }

        items.forEach((lawyer: any) => {
          const specs = Array.isArray(lawyer?.specializations)
            ? lawyer.specializations
            : Array.isArray(lawyer?.specialization)
              ? lawyer.specialization
              : [];

          specs.forEach((spec: unknown) => {
            if (typeof spec === 'string' && spec.trim()) {
              serverOptions.add(spec.trim());
            }
          });
        });

        if (isMounted && serverOptions.size > 0) {
          setCaseTypeOptions(sortAlphabetically(Array.from(serverOptions)));
        }
      } catch (error) {
        console.error('Failed to load case types for home page search', error);
      }
    };

    fetchCaseTypes();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFindLawyer = (e: FormEvent) => {
    e.preventDefault();

    const trimmedLocation = location.trim();
    if (!trimmedLocation) return;

    const params = new URLSearchParams({ location: trimmedLocation });
    if (caseType) {
      params.set('specialization', caseType);
    }

    navigate(`/app/search?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-white">

      {/* Hero – Prestige + Immediate Action */}
      <section className="relative pt-8 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-white to-midnight/5"></div>
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center pt-12">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
              Your Legal Matter
              <span className="block text-primary">Deserves the Best</span>
            </h1>
            <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Connect with India’s top verified lawyers in minutes. Track every hearing, document, and deadline —
              with complete privacy and control.
            </p>

            {/* Premium Search Bar */}
            <div className="mt-12 max-w-4xl mx-auto">
              <form
                onSubmit={handleFindLawyer}
                className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex flex-col md:flex-row items-center gap-4"
              >
                <div className="flex items-center flex-1 w-full">
                  <MapPin className="w-6 h-6 text-primary ml-4" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City or Area (e.g., Mumbai, Delhi High Court)"
                    className="px-4 py-4 w-full outline-none text-gray-800"
                    required
                  />
                </div>
                <div className="hidden md:block w-px bg-gray-300 h-12"></div>
                <div className="flex items-center flex-1 w-full">
                  <Gavel className="w-6 h-6 text-primary ml-4" />
                  <select
                    value={caseType}
                    onChange={(e) => setCaseType(e.target.value)}
                    className="px-4 py-4 w-full outline-none text-gray-800 bg-transparent"
                  >
                    <option value="">All Case Types (Optional)</option>
                    {caseTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="bg-primary hover:bg-midnight text-white font-semibold px-10 py-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={!location.trim()}
                >
                  Find Your Lawyer
                </button>
              </form>
            </div>

            {/* Trust Bar */}
            <div className="flex flex-wrap justify-center gap-10 mt-16 text-gray-700">
              <div className="flex items-center gap-3">
                <Shield className="w-7 h-7 text-primary" />
                <span className="font-medium">Bar Council Verified Lawyers</span>
              </div>
              <div className="flex items-center gap-3">
                <Star className="w-7 h-7 text-accent fill-current" />
                <span className="font-medium">4.9/5 Client Rating</span>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-7 h-7 text-primary" />
                <span className="font-medium">82,000+ Cases Managed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Limited Time Premium Offer – Scarcity + Value */}
      <div className="bg-gradient-to-r from-accent to-orange-600 py-4">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-white font-semibold text-lg">
            Limited Period: Get ₹2,999 First Consultation FREE + Lifetime Case Vault Access
            <a href="#" className="underline ml-3 font-bold">Claim Offer →</a>
          </p>
        </div>
      </div>

      {/* Premium Feature Spotlight – Lex Rates, Tele Law, Legal Eagle, Case Timeline */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900">
              Powerful Tools Built for You
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Everything you need to stay informed and in control
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 p-16">
            {[
              {
                title: "Lex Rates",
                desc: "Know the fair legal service price across India",
                img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSqSor89Clzgd4KZjAKGJbgrCAeCjkYtEPSOQ&s",
                path: "/app/lex-rates",
              },
              {
                title: "Tele Law",
                desc: "Free government-backed legal advice in 22 Indian languages",
                img: "https://images.unsplash.com/photo-1556155092-490a1ba16284?ixlib=rb-4.0.3&auto=format&fit=crop&w=1350&q=80",
                path: "/app/tele-law",
              },
              {
                title: "Legal Eagle",
                desc: "ask legal matters to your AI companion",
                img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT55EvWS_0iC_K5HV2ImglPxquDhvMmFxsJaw&s",
                path: "/app/legal-eagle",
              },
              {
                title: "Case Tracker",
                desc: "Never miss a hearing again with auto reminders",
                img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQLPwBKrnR3653VzBvyOac6EMkPfaNzRO1fWw&s",
                path: "/app/cases",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 hover:border-primary/30 cursor-pointer"
              >
                {/* Image – 60% */}
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={feature.img}
                    alt={feature.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  {/* <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div> */}
                  {/* <div className="absolute bottom-4 left-4">
                    <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                      {feature.title}
                    </h3>
                  </div> */}
                </div>

                {/* Text – 40% */}
                <Link to={feature.path} className="block p-6 bg-white">
                  <div className="p-6 bg-white">
                    <h3 className="text-2xl font-semibold text-gray-800 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm font-light text-gray-500 leading-relaxed">
                      {feature.desc}
                    </p>
                    {/* <div className="mt-4 flex justify-center">
                        <ChevronRight className="w-6 h-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div> */}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="relative bg-gradient-to-br from-midnight to-primary rounded-2xl overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative p-12 text-white">
          <h3 className="text-3xl font-bold mb-4">Get Free Consultation through - Tele Law</h3>
          <p className="text-lg opacity-90 mb-8">Daily updates on New judgments • Government schemes • Rights explained in simple language</p>
          {/* <a href="#" className="inline-flex items-center text-accent font-semibold hover:underline">
                Start Learning Free <ChevronRight className="ml-2 w-5 h-5" />
              </a> */}
          <span className="flex justify-end">
            <Link to="/app/tele-law" className="inline-flex items-center text-accent font-semibold hover:underline"> Check Your Eligibility <ChevronRight className="ml-2 w-5 h-5" /> </Link>
          </span>
        </div>
      </div>

      {/* Core Benefits – Elegant Cards */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
            One Platform. Complete Peace of Mind.
          </h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { icon: PhoneCall, title: "Instant Lawyer Connect", desc: "Speak to a specialist lawyer within 5 minutes — 24×7" },
              { icon: Calendar, title: "Never Miss a Hearing", desc: "Auto-reminders, calendar sync & judge-wise updates" },
              { icon: FileText, title: "Digital Case File", desc: "All documents, orders & evidence in one encrypted vault" },
              { icon: BellRing, title: "Real-Time Case Updates", desc: "Get notified the moment your case moves" },
              { icon: Shield, title: "Bank-Grade Security", desc: "End-to-end encryption. Your privacy is non-negotiable" },
              { icon: BookOpen, title: "Know Your Rights", desc: "Daily updates on new laws, judgments & government schemes" },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl p-8 border border-gray-100 hover:border-primary/20 transition-all duration-300 hover:shadow-xl group">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6 group-hover:bg-primary/20 transition">
                  <item.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="relative bg-gradient-to-br from-primary to-midnight rounded-2xl overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative p-12 text-white">
          <h3 className="text-3xl font-bold mb-4">Manage Your Entire Case in One View</h3>
          <p className="text-lg opacity-90 mb-8">Next hearing • Documents • Lawyer notes • Timeline — always updated</p>
          {/* <a href="#" className="inline-flex items-center text-accent font-semibold hover:underline">
                Explore Your Case Dashboard <ChevronRight className="ml-2 w-5 h-5" />
              </a> */}
          <span>
            <Link to="/app/home" className="inline-flex items-center text-accent font-semibold hover:underline"> Explore Your Case Dashboard <ChevronRight className="ml-2 w-5 h-5" /> </Link>
          </span>
        </div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-accent/20 rounded-rounded blur-3xl"></div>
        <div className="absolute top-48 left-48 w-80 h-80 bg-accent/20 rounded-rounded blur-3xl"></div>
      </div>

      {/* Premium Feature Showcases (In-App Advertising – Elegant) */}
      {/* <section className="py-24 px-6"> */}
      {/* <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12"> */}
      {/* Case Dashboard Preview */}
      {/* <div className="relative bg-gradient-to-br from-primary to-midnight rounded-2xl overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-black/40"></div>
            <div className="relative p-12 text-white">
              <h3 className="text-3xl font-bold mb-4">Your Entire Case in One View</h3>
              <p className="text-lg opacity-90 mb-8">Next hearing • Documents • Lawyer notes • Timeline — always updated</p>
              <a href="#" className="inline-flex items-center text-accent font-semibold hover:underline">
                Explore Your Dashboard <ChevronRight className="ml-2 w-5 h-5" />
              </a>
            </div>
            <div className="absolute bottom-0 right-0 w-80 h-80 bg-accent/20 rounded-full blur-3xl"></div>
          </div> */}

      {/* Legal Awareness Hub */}
      {/* <div className="relative bg-gradient-to-br from-midnight to-primary rounded-2xl overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-black/40"></div>
            <div className="relative p-12 text-white">
              <h3 className="text-3xl font-bold mb-4">Know your Rights - For Free</h3>
              <p className="text-lg opacity-90 mb-8">Daily updates on New judgments • Government schemes • Rights explained in simple language</p>
              <a href="#" className="inline-flex items-center text-accent font-semibold hover:underline">
                Start Learning Free <ChevronRight className="ml-2 w-5 h-5" />
              </a>
            </div>
          </div> */}
      {/* </div> */}
      {/* </section> */}

      {/* Social Proof – Premium Testimonials */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-16">Trusted by Thousands Across India</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { name: "Justice (Retd.) R. K. Malhotra", role: "Former Judge, Delhi High Court", text: "Finally, a platform that brings transparency to legal practice." },
              { name: "Adv. Neha Kapoor", role: "Senior Advocate, Supreme Court", text: "I manage 40+ cases seamlessly. My clients love the real-time updates." },
              { name: "Rohan Mehra", role: "Client, Mumbai", text: "Saved ₹1.2 lakh in penalties because of timely hearing alerts." },
            ].map((t, i) => (
              <div key={i} className="bg-white rounded-xl p-8 shadow-lg">
                <div className="flex justify-center mb-4">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-6 h-6 text-accent fill-current" />)}
                </div>
                <p className="text-gray-700 italic text-lg leading-relaxed">"{t.text}"</p>
                <p className="mt-6 font-semibold text-primary">{t.name}</p>
                <p className="text-sm text-gray-600">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA – Prestige Close */}
      <section className="py-24 bg-gradient-to-r from-primary to-midnight text-white">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Take Control of Your Legal Journey Today
          </h2>
          <p className="text-xl opacity-90 mb-10">
            Join 82,000+ Indians who never worry about case status again.
          </p>
          <h4 className="text-2xl md:text-2xl font-bold mb-2"> For Support </h4>
          <button className="bg-accent hover:bg-orange-500 text-primary font-bold text-2xl px-12 py-5 rounded-lg transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-1">
            Call Us Now: 1800-123-4567
          </button>
        </div>
      </section>
    </div>
  );
};

export default HomePage;