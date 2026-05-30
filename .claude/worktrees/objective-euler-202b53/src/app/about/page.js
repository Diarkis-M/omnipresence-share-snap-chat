import Chrome from '@/components/Chrome';

export default function AboutPage() {
  return (
    <Chrome>
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <div className="hero-bg text-white py-16">
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4">Methodology</h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            How Muuchstac Scout discovers, analyzes, and scores YouTube influencers
            using the Parasocial Capital Framework.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-12">
        {/* PCF Overview */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            The Parasocial Capital Framework (PCF)
          </h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 leading-relaxed">
              Traditional influencer marketing metrics focus on reach and engagement rates.
              But the most effective influencer partnerships are built on something deeper —
              the emotional bond between a creator and their audience. This is called a
              <strong> parasocial relationship</strong>: a one-sided connection where the audience
              feels they truly know and trust the creator, even though the relationship is not
              reciprocal. The Parasocial Capital Framework (PCF) is designed to measure and
              score this bond.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              PCF goes beyond vanity metrics. Instead of just counting likes and subscribers,
              it analyzes the <em>quality</em> of audience engagement — looking for signals of
              genuine trust, purchase intent, personal storytelling, and community belonging
              in the comments section. An influencer with 50K subscribers and deep parasocial
              bonds will drive more conversions for a GCPL brand than one with 500K subscribers
              and shallow engagement.
            </p>
          </div>
        </section>

        {/* 5 Dimensions */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            Five Scoring Dimensions
          </h2>
          <div className="space-y-4">
            {[
              {
                name: 'Engagement Quality',
                weight: '25%',
                color: '#6AB637',
                description: 'Goes beyond like-to-view ratios. Analyzes whether comments are substantive — referencing specific product features, asking genuine questions, sharing personal experiences — versus low-quality "nice video bro" spam. High-quality engagement indicates an audience that actually pays attention.',
              },
              {
                name: 'Reach Relevance',
                weight: '25%',
                color: '#2798FC',
                description: 'Evaluates subscriber count relative to niche size and view-to-subscriber ratio. Penalizes channels with high subscribers but low views (indicating a dead or purchased audience). A nano-influencer with great view ratios scores higher than a macro-influencer with dead subscribers.',
              },
              {
                name: 'Parasocial Depth',
                weight: '18%',
                color: '#B9105E',
                description: 'Measures the emotional bond between creator and audience by looking for: personal stories in comments ("I tried this because you recommended"), purchase confessions ("ordered it after your video"), repeat commenters, creator trust signals, and community language (inside jokes, nicknames). This is what separates an influencer from a content creator.',
              },
              {
                name: 'Brand Fit',
                weight: '12%',
                color: '#fdcb6e',
                description: 'Evaluates alignment between the creator\'s content, audience, and values with the specified GCPL brand. Considers product category match, audience demographics, content quality, and brand safety. A beard care reviewer is a natural fit for Muuchstac; a gaming creator is not.',
              },
              {
                name: 'Growth Potential',
                weight: '20%',
                color: '#66BEBE',
                description: 'Assesses whether the creator is on an upward trajectory. Signals include: recent upload frequency and consistency, subscriber growth trends, increasing view counts on newer videos, and niche positioning in a growing content segment. The best time to partner is before they peak.',
              },
            ].map((dim) => (
              <div
                key={dim.name}
                className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: dim.color }}
                  />
                  <h3 className="text-lg font-bold text-gray-800">{dim.name}</h3>
                  <span className="badge bg-gray-100 text-gray-600">Weight: {dim.weight}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{dim.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data Sources */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Data Sources</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800 mb-1">YouTube Data API v3</h3>
              <p className="text-sm text-gray-500">
                Official Google API for searching videos, fetching channel statistics,
                subscriber counts, and top comments. All data collection is compliant
                with YouTube&apos;s Terms of Service.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800 mb-1">Anthropic Claude AI</h3>
              <p className="text-sm text-gray-500">
                Claude (claude-sonnet-4-20250514) performs deep comment analysis — detecting
                sentiment patterns, parasocial indicators, fraud signals, and generating
                nuanced brand-fit assessments that go far beyond simple keyword matching.
              </p>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="bg-navy rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Built for GCPL Gurukul 2026</h2>
          <p className="text-gray-300 mb-6 leading-relaxed">
            Muuchstac Scout was built as part of the GCPL Gurukul Internship 2026.
            It is designed to be institutionalized across GCPL&apos;s brand portfolio
            — enabling data-driven influencer selection at scale.
          </p>
          <div className="flex justify-center">
            <div className="bg-white/10 rounded-xl p-4 text-center w-48">
              <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-accent font-bold text-lg">S</span>
              </div>
              <div className="font-semibold">Shashwat</div>
              <div className="text-xs text-gray-400 mt-0.5">XLRI Jamshedpur</div>
            </div>
          </div>
        </section>
      </div>
    </div>
    </Chrome>
  );
}
