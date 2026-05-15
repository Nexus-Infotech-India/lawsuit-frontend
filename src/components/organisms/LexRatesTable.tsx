import { FC } from 'react';
import { Shield, Gavel, Scale, Info, CheckCircle } from 'lucide-react';

const LexRatesTable: FC = () => {
  return (
    <div className="min-h-screen bg-white">

      {/* Hero – Trust First */}
      <section className="bg-gradient-to-br from-primary/5 via-white to-midnight/5 py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-primary/10 rounded-full">
              <Scale className="w-12 h-12 text-primary" />
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            <span className='text-primary'>Lex Rate</span> – Transparent Legal Fees in India
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
            Know the fair consultation charges before you connect with any lawyer.  
            No more surprises. No more overcharging.
          </p>
          <div className="flex justify-center items-center gap-8 mt-10 text-gray-700">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary" />
              <span className="font-medium">Based on 1,20,000+ real consultations</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-primary" />
              <span className="font-medium">Updated monthly • 100% anonymous</span>
            </div>
          </div>
        </div>
      </section>

      {/* Price Grid – Clean & Premium */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900">
              Average Consultation Charges as of - 2025
            </h2>
            {/* <p className="mt-4 text-lg text-gray-600">
              Includes phone, video, or in-person meeting (up to 45 mins)
            </p> */}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { category: "Criminal Law", range: "₹3,000 – ₹7,000", color: "from-red-500 to-rose-600", cases: "Bail • 498A • NDPS • Cheating • Murder" },
              { category: "Divorce & Family", range: "₹1,500 – ₹4,000", color: "from-primary to-midnight", cases: "Mutual Divorce • Contested • Maintenance • Custody" },
              { category: "Property Disputes", range: "₹2,000 – ₹5,000", color: "from-amber-600 to-orange-600", cases: "Title Dispute • Partition • Builder Delay • RERA" },
              { category: "Civil Suits", range: "₹1,200 – ₹3,500", color: "from-teal-600 to-emerald-700", cases: "Recovery • Injunction • Specific Relief • Contract Breach" },
              { category: "Cheque Bounce / NI Act", range: "₹800 – ₹2,500", color: "from-purple-600 to-indigo-700", cases: "Section 138 cases • Recovery suits" },
              { category: "Consumer Court", range: "₹1,000 – ₹3,000", color: "from-sky-600 to-blue-700", cases: "Defective product • Deficiency in service" },
              { category: "Labour & Service", range: "₹2,000 – ₹5,000", color: "from-emerald-600 to-green-700", cases: "Wrongful termination • Salary dispute • PF/Gratuity" },
              { category: "Corporate & Tax", range: "₹4,000 – ₹12,000", color: "from-slate-700 to-gray-900", cases: "Company matters • GST • Income Tax • Arbitration" },
              { category: "General Advice", range: "₹500 – ₹2,000", color: "from-gray-500 to-gray-700", cases: "Legal notice reply • Will • Agreement drafting" },
            ].map((item) => (
              <div
                key={item.category}
                className="group relative bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-2xl transition-all duration-500"
              >
                <div className={`h-2 bg-gradient-to-r ${item.color}`}></div>
                <div className="p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{item.category}</h3>
                  <div className="text-4xl font-bold text-primary mb-4">
                    {item.range}
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {item.cases}
                  </p>
                  <div className="mt-6 flex items-center gap-2 text-primary font-medium">
                    <Info className="w-5 h-5" />
                    <span>Charges may vary by city & lawyer experience</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Footer */}
      <section className="py-16 bg-primary text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-6">
            We Believe Justice Should Begin with Transparency
          </h2>
          <p className="text-xl opacity-90 max-w-3xl mx-auto">
            Lex Rate is completely free • No lawyer can pay to change these rates • 
            Data sourced anonymously from verified consultations across India
          </p>
          <div className="mt-10 flex justify-center items-center gap-3">
            <Gavel className="w-10 h-10 text-accent" />
            <span className="text-2xl font-bold text-accent">Powered by NyayaX</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LexRatesTable;