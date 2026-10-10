export default function SitePage() {
  return (
    <>
      <header className="wrap hero">
        <div className="eyebrow">FixitFelix · Hackathon build guide</div>
        <h1>Three engineers.<br />One faster helpdesk.</h1>
        <p className="lede">A focused 24-hour plan for a standalone demo that turns a short student report or sensor alert into a routed ticket, then follows the repair through verification.</p>
        <div className="chips">
          <span className="chip">24-hour MVP</span>
          <span className="chip">3 full-stack engineers</span>
          <span className="chip">Node + browser UI</span>
          <span className="chip">LDR lighting demo</span>
        </div>
      </header>
      <main className="wrap">
        <section>
          <div className="head"><h2>Simple stack and flow</h2><p className="note">Keep the whole demo local and deterministic. The sensor simulator and the physical LDR use the same event shape.</p></div>
          <div className="flow" role="img" aria-label="A student report or sensor alert goes to a Node API, then a WhatsApp assignment lets the technician accept and schedule or decline from a phone.">
            <div className="node input"><span className="tag">Inputs</span><strong>Student form + LDR</strong><p>Short text issue or normalized brightness reading. Browser simulator is the reliable fallback.</p></div>
            <div className="node api"><span className="tag">App</span><strong>Next.js API</strong><p>Classifies reports, assigns an available technician, handles schedule/decline, and controls ticket status.</p></div>
            <div className="node store"><span className="tag">Data</span><strong>Local JSON store</strong><p>Tickets, assignment responses, schedules, sensor evidence, and activity timeline.</p></div>
            <div className="node"><span className="tag">Technician</span><strong>WhatsApp response page</strong><p>Accept and schedule or decline from a phone; a decline messages the next available technician.</p></div>
            <div className="node input"><span className="tag">Outcome</span><strong>Verified resolution</strong><p>AI checks the completion photo; lighting tickets also require recovered sensor readings.</p></div>
          </div>
          <p className="note">WhatsApp flow: Next.js API → Twilio WhatsApp → technician phone → mobile response page → Next.js API. Use a public HTTPS tunnel so the phone can reach the response page from any network.</p>
          <a className="run" href="/">Run the demo</a>
        </section>
        <section>
          <div className="head"><h2>Split work by ownership</h2><p className="note">The API contract is the shared boundary. Agree on fields and statuses before changing them.</p></div>
          <div className="roles">
            <article className="role"><span className="num">1</span><h3>API + ticket workflow</h3><p>Owns rules and canonical ticket data.</p><ul><li>Report and sensor endpoints</li><li>Available-technician routing and decline fallback</li><li>WhatsApp responses, AI photo verification, and persistence</li></ul></article>
            <article className="role"><span className="num">2</span><h3>Student + technician UI</h3><p>Owns the user-facing experience.</p><ul><li>Short report form and private student status page</li><li>Keep accept/decline only on the technician WhatsApp response page</li><li>Show assignment, WhatsApp status, evidence, and timeline</li></ul></article>
            <article className="role"><span className="num">3</span><h3>Sensor + demo integration</h3><p>Owns physical evidence and reliable rehearsal.</p><ul><li>Calibrate LDR and normalize readings</li><li>Connect hardware or keep simulator ready</li><li>Own reset, setup, and fallback runbook</li></ul></article>
          </div>
        </section>
        <section>
          <div className="head"><h2>24-hour sequence</h2><p className="note">Integrate early, freeze features with time left to rehearse.</p></div>
          <div className="schedule">
            <article className="phase"><time>0–1 hour</time><p><strong>All:</strong> agree contract and story.<br /><strong>Eng 1:</strong> start API.<br /><strong>Eng 2:</strong> map screens.<br /><strong>Eng 3:</strong> check sensor range.</p></article>
            <article className="phase"><time>1–4 hours</time><p><strong>Eng 1:</strong> routing, rules, persistence.<br /><strong>Eng 2:</strong> form, queue, actions.<br /><strong>Eng 3:</strong> simulator and LDR calibration.</p></article>
            <article className="phase"><time>4–8 hours</time><p>Student reports and three low readings create tickets visible in the same queue. Prevent duplicate sensor tickets.</p></article>
            <article className="phase"><time>8–12 hours</time><p>Finish technician schedule and decline flow; route declined assignments to the next available technician.</p></article>
            <article className="phase"><time>12–16 hours</time><p>Run the complete failure-then-recovery scenario with hardware and simulator fallback.</p></article>
            <article className="phase"><time>16–24 hours</time><p>Freeze features, reset data, polish the pitch, and rehearse the same demo repeatedly.</p></article>
          </div>
        </section>
        <section>
          <div className="head"><h2>Demo: assignment to verified repair</h2><p className="note">Show the ticket moving through a simple technician response and repair process.</p></div>
          <div className="demo">
            <div className="step"><strong>Detect</strong><p>Simulate dim light or cover the LDR. Three readings create a ticket.</p></div>
            <div className="step"><strong>Notify</strong><p>Open the assignment WhatsApp on the technician&apos;s phone, using the public tunnel link.</p></div>
            <div className="step"><strong>Schedule or decline</strong><p>Accept and choose a visit time, or decline to message the next available technician.</p></div>
            <div className="step"><strong>Attempt repair</strong><p>Start work and mark the repair attempt while the room is still dim.</p></div>
            <div className="step"><strong>Follow up</strong><p>Ticket stays open because the sensor still reports low brightness.</p></div>
            <div className="step"><strong>Verify close</strong><p>Bright readings and an AI-approved completion photo confirm the repair.</p></div>
          </div>
          <div className="callout"><strong>Demo boundaries:</strong> assignments are fictional, student classification uses simple demo rules, and the sensor simulator is the fallback. WhatsApp needs Twilio settings; repair completion needs a Gemini API key and photo evidence.</div>
        </section>
      </main>
      <footer className="wrap">Prepared from the FixitFelix engineering workflow. Static share page; no login or external assets required.</footer>
      <style>{`
        :root{--ink:#17212b;--muted:#62727c;--paper:#f2f6f5;--card:#fff;--line:#dce6e5;--navy:#102b3f;--teal:#0e8a7a;--teal-soft:#e8f6f2;--blue:#315fa8;--blue-soft:#edf2fc;--gold:#94600c;--gold-soft:#fcf3df;--shadow:0 14px 38px #102b3f0d}
        *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .wrap{width:min(1100px,calc(100% - 36px));margin:auto}
        .hero{padding:54px 0 32px}
        .eyebrow{color:var(--teal);font-size:.75rem;font-weight:850;letter-spacing:.13em;text-transform:uppercase}
        h1{max-width:800px;margin:12px 0;font-size:clamp(2.5rem,7vw,4.4rem);line-height:1;letter-spacing:-.06em;color:var(--navy)}
        .lede{max-width:760px;color:var(--muted);font-size:1.12rem}
        .chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}
        .chip{padding:6px 11px;border:1px solid var(--line);border-radius:99px;background:#ffffffc9;font-size:.8rem;font-weight:700}
        main{padding-bottom:50px}
        section{margin-top:20px;padding:clamp(21px,4vw,34px);border:1px solid var(--line);border-radius:19px;background:var(--card);box-shadow:var(--shadow)}
        .head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:19px}
        h2{margin:0;color:var(--navy);font-size:clamp(1.35rem,3vw,1.8rem);letter-spacing:-.03em}h3{margin:0 0 6px;font-size:1rem}
        .note{max-width:500px;color:var(--muted);font-size:.88rem}
        .run{display:inline-block;margin-top:16px;padding:10px 20px;border-radius:9px;background:var(--teal);color:#fff;text-decoration:none;font-weight:700}
        .flow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
        .node{position:relative;min-height:150px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#fbfdfc}
        .node:not(:last-child)::after{content:"→";position:absolute;right:-15px;top:42%;z-index:1;color:var(--teal);font-size:20px;font-weight:800}
        .node .tag{display:block;margin-bottom:12px;color:var(--muted);font-size:.67rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
        .node strong{display:block;margin-bottom:6px;color:var(--navy);font-size:1rem}
        .node p{margin:0;color:var(--muted);font-size:.86rem}
        .node.input{background:#f2faf7;border-color:#d7ece2}.node.api{background:#f1f5fc;border-color:#dce5f6}.node.store{background:#fffaf0;border-color:#eee4c9}
        .roles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .role{padding:18px;border:1px solid var(--line);border-radius:14px}.role .num{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--navy);color:#fff;font-weight:800;font-size:.85rem;margin-bottom:10px}
        .role p{color:var(--muted);font-size:.88rem;margin:0 0 10px}.role ul{margin:0;padding-left:17px;color:var(--muted);font-size:.85rem}.role li{margin-bottom:4px}
        .schedule{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .phase{padding:16px;border:1px solid var(--line);border-radius:12px;background:#fbfdfc}.phase time{display:block;color:var(--teal);font-weight:800;font-size:.83rem;margin-bottom:8px}.phase p{margin:0;color:var(--muted);font-size:.86rem;line-height:1.5}
        .demo{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .step{padding:16px;border:1px solid var(--line);border-radius:12px;background:#fbfdfc}.step strong{display:block;color:var(--navy);margin-bottom:6px}.step p{margin:0;color:var(--muted);font-size:.86rem}
        .callout{margin-top:16px;padding:14px;border-radius:9px;background:var(--gold-soft);color:var(--gold);font-size:.88rem;line-height:1.5}
        footer{padding:24px 0;color:var(--muted);font-size:.85rem}
        @media(max-width:800px){.flow{grid-template-columns:1fr}.node{min-height:0}.node:not(:last-child)::after{content:"↓";right:50%;top:auto;bottom:-18px}.roles{grid-template-columns:1fr}.schedule{grid-template-columns:repeat(2,1fr)}.demo{grid-template-columns:1fr 1fr}.head{display:block}.note{margin-top:7px}}
        @media(max-width:520px){.wrap{width:calc(100% - 24px)}.hero{padding-top:36px}.schedule,.demo{grid-template-columns:1fr}section{border-radius:15px}}
      `}</style>
    </>
  );
}
