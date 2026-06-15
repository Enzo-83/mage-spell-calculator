// Glossary data and GlossaryTip React component (plain React.createElement — no JSX)
// Loaded by index.html and wizard.html after React CDN. Exposes window.GlossaryTip.

(function () {
  var GLOSSARY = {
    potency: {
      term: "Potency",
      def: "Measures the strength of a spell's direct effect — damage dealt, healing provided, or intensity of a transformation. Each Potency level above the free amount incurs a dice penalty.",
    },
    duration: {
      term: "Duration",
      def: "How long a spell persists. The base (1 turn) is free; steps above the free level incur a dice penalty. Advanced Duration (Scene and beyond) costs +1 Reach. Some durations also cost Mana.",
    },
    scale: {
      term: "Scale",
      def: "The area affected or number of targets. 1 person or object is always the free level. Each step beyond costs dice. Advanced Scale requires +1 Reach. Subjects and Area modes have separate size tables.",
    },
    range: {
      term: "Range",
      def: "How far the spell can reach. Self and Touch are free. Aimed requires an attack roll. Sensory costs +1 Reach. Remote Viewed costs +2 Reach. Sympathetic (Space 2 + 1 Mana) and Temporal (Time 2 + 1 Mana) are the most distant.",
    },
    reach: {
      term: "Reach",
      def: "Spent to push a spell beyond its base parameters — enabling Advanced factors, Instant casting, or extra effects. Free Reach equals your Arcanum dots − the spell's required dots + 1 (minimum 1). Within free Reach a spell costs no Paradox and no inherent Mana. Each Reach point beyond free adds ⌈Gnosis÷2⌉ dice to the Paradox pool; spending Mana to offset them is optional.",
    },
    castingMethod: {
      term: "Casting Method",
      def: "Improvised: standard casting; +1 Mana if the Arcanum is not a Ruling Arcanum.\nPraxis: a personally mastered spell; Exceptional Success at 3 successes.\nRote: a recorded formula; grants Rote Quality (reroll failed dice once). Rotes with Mudra allow an Order Skill bonus.",
    },
    yantra: {
      term: "Yantra",
      def: "A ritual tool, gesture, or symbolic element that adds bonus dice. The first Yantra is reflexive; each additional adds 1 turn to casting. Max usable = ⌈Gnosis÷2⌉+1. The net bonus cap after penalties is +5.",
    },
    paradox: {
      term: "Paradox",
      def: "The universe's resistance to blatant magic. Triggered when Reach exceeds the free limit. Each excess Reach adds ⌈Gnosis÷2⌉ Paradox dice. Spending Mana is an optional mitigation (−1 die per Mana) and is not the only way to reduce Paradox, but at least a Chance Die always remains when there is any excess Reach.",
    },
    mana: {
      term: "Mana",
      def: "Magical fuel drawn from a mage's Nimbus. Required for: Improvised spells with a non-Ruling Arcanum (+1), Indefinite Duration (+1), and Sympathetic or Temporal Range (+1). Optionally spent to mitigate Paradox (−1 Paradox die per Mana) — exceeding free Reach generates Paradox dice but no inherent Mana cost.",
    },
    willpower: {
      term: "Willpower",
      def: "Spending 1 Willpower point adds +3 dice to the spellcasting roll, representing focused intent. A mage's maximum equals Resolve + Composure and is typically recovered through rest or significant story milestones.",
    },
    rollQuality: {
      term: "Roll Quality (n-Again)",
      def: "The \"again\" rule controls which dice reroll and can keep adding successes. Standard rolls are 10-Again — every 10 rerolls.\n9-Again lowers the threshold so 9s and 10s reroll; 8-Again so 8s, 9s, and 10s reroll. Each step yields more successes on average.\nTick these only when a spell or effect grants improved again quality to the casting roll. Rote Quality (rerolling failed dice) comes from the Casting Method, not here.",
    },
    castingTime: {
      term: "Casting Time",
      def: "Ritual: cast over intervals (length varies by Gnosis, e.g. 1 turn at Gnosis 1 up to several hours at high Gnosis). Each ritual interval adds +1 die, max +5. Instant costs +1 Reach. Grimoire Rotes double the ritual interval length.",
    },
  };

  var POPOVER_W = 264;

  function GlossaryTip(props) {
    var term = props.term;
    var entry = GLOSSARY[term];
    if (!entry) return null;

    var _useState = React.useState(false);
    var open = _useState[0];
    var setOpen = _useState[1];

    var ref = React.useRef(null);
    var popRef = React.useRef(null);

    React.useEffect(function () {
      if (!open) return;
      function handler(e) {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      }
      document.addEventListener("mousedown", handler);
      return function () { document.removeEventListener("mousedown", handler); };
    }, [open]);

    React.useLayoutEffect(function () {
      if (!open || !popRef.current || !ref.current) return;
      var pop = popRef.current;
      var anchor = ref.current.getBoundingClientRect();
      var vw = window.innerWidth;
      var leftEdge = anchor.left;
      var rightEdge = leftEdge + POPOVER_W;
      if (rightEdge > vw - 12) {
        pop.style.left = "auto";
        pop.style.right = "0";
      } else {
        pop.style.left = "0";
        pop.style.right = "auto";
      }
    }, [open]);

    var lines = entry.def.split("\n");

    return React.createElement(
      "span",
      {
        ref: ref,
        style: { position: "relative", display: "inline-block", verticalAlign: "middle" },
      },
      React.createElement(
        "button",
        {
          type: "button",
          onClick: function (e) {
            e.stopPropagation();
            setOpen(function (o) { return !o; });
          },
          title: "Glossary: " + entry.term,
          style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 12,
            lineHeight: 1,
            padding: "0 3px",
            opacity: 0.7,
            userSelect: "none",
          },
        },
        "ⓘ"
      ),
      open
        ? React.createElement(
            "div",
            {
              ref: popRef,
              style: {
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                zIndex: 9999,
                background: "var(--bg-card)",
                border: "1px solid var(--accent-border)",
                borderRadius: 8,
                padding: "10px 14px",
                width: POPOVER_W,
                boxShadow: "0 4px 24px rgba(0,0,0,0.55)",
                textTransform: "none",
                letterSpacing: "normal",
              },
            },
            React.createElement(
              "div",
              {
                style: {
                  color: "var(--accent-light)",
                  fontWeight: 700,
                  fontSize: 12,
                  marginBottom: 5,
                  textTransform: "none",
                  letterSpacing: "normal",
                },
              },
              entry.term
            ),
            lines.map(function (line, i) {
              return React.createElement(
                "p",
                {
                  key: i,
                  style: {
                    margin: i > 0 ? "4px 0 0" : 0,
                    color: "var(--text)",
                    fontSize: 11,
                    lineHeight: 1.55,
                    fontWeight: "normal",
                  },
                },
                line
              );
            })
          )
        : null
    );
  }

  window.GlossaryTip = GlossaryTip;
})();
