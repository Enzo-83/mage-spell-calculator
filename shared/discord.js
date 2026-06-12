// shared/discord.js — Discord webhook layer (Code Review Plan, Phase 7)
// Used by index.html (Classic vanilla block + ClashPill) and wizard.html.
// Load order: js/gameData.js → this file. No Firebase dependency.
//
// Exposed as ONE namespaced global (window.DiscordShared) rather than bare
// functions: Babel standalone runs text/babel blocks in global scope, and
// wizard.html historically declared its own `postDiscord` there — a single
// object keeps the collision surface to one name.
//
// Webhook URLs live on the character object (character.discord.*). They are
// kept in the character JSON export (it is the user's backup; stripping would
// lose them on restore) — the export path warns instead. sessionPushSheet
// already omits them from shared Firebase paths.
const DiscordShared = (() => {

    // POST one payload to a webhook; throws on network error or non-2xx.
    async function postDiscord(url, payload) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
    }

    // Embed accent color: arcanum name in any case → canonical int,
    // app-purple fallback (handles null/unknown).
    const arcanumColor = (name) => MageData.arcanumInt(name);

    // Dice-bot command for a casting roll: $cod/$rote [8|9-again] + pool.
    function formatDiceCommand(pool, rollQuality) {
        let cmd = '$' + (rollQuality.quality === 'rote' ? 'rote' : 'cod');
        if (rollQuality.againValue === 8) cmd += '8';
        else if (rollQuality.againValue === 9) cmd += '9';
        return cmd + ' ' + pool;
    }

    // Dice-bot command for a Paradox roll (always $cod; chance die rolls 0).
    function formatParadoxCommand(paradoxResult) {
        const pool = paradoxResult.isChanceDie ? 0 : paradoxResult.finalDice;
        let cmd = '$cod';
        if (paradoxResult.rollQuality.againValue === 8) cmd += '8';
        else if (paradoxResult.rollQuality.againValue === 9) cmd += '9';
        return cmd + ' ' + pool;
    }

    // Embed envelope. Pass `arcanum` (name) or an explicit `color` int;
    // `timestamp: true` adds the current time (Classic embeds show it,
    // wizard embeds historically don't).
    function buildEmbed({ title, arcanum, color, fields, footerText, timestamp }) {
        const embed = {
            title,
            color: color ?? arcanumColor(arcanum),
            fields,
        };
        if (footerText) embed.footer = { text: footerText };
        if (timestamp) embed.timestamp = new Date().toISOString();
        return embed;
    }

    // Compact pool-summary fields shared by every "Send Dice Pool" button:
    // 🎲 Dice Pool / ↑ Reach / ⬡ Mana / ⚠️ Paradox (only when over free Reach).
    function buildPoolSummaryFields({ pool, usedReach, freeReach, excessReach, manaCost, paradoxText }) {
        const fields = [
            { name: '🎲 Dice Pool', value: String(pool), inline: true },
            { name: '↑ Reach', value: `${usedReach}/${freeReach}${excessReach > 0 ? ' ⚠' : ''}`, inline: true },
            { name: '⬡ Mana', value: String(manaCost), inline: true },
        ];
        if (excessReach > 0) {
            fields.push({ name: '⚠️ Paradox', value: paradoxText, inline: true });
        }
        return fields;
    }

    // The standard two-message send: embed summary, then the bot command
    // as a separate plain message so dice bots can parse it.
    async function postEmbedThenCommand(webhook, username, embed, command) {
        await postDiscord(webhook, { username, embeds: [embed] });
        await postDiscord(webhook, { content: command, username });
    }

    // Clash of Wills send — identical embed on both pages.
    // `breakdown` is the human-readable pool breakdown for the footer,
    // e.g. "Gnosis 3 + Forces 4 + WP +3".
    async function postClash(webhook, { casterName, pool, arcLabel, arcDots, breakdown }) {
        const embed = buildEmbed({
            title: `${casterName}'s Clash of Wills`,
            color: 0x9d4edd,
            fields: [
                { name: '⚔ Clash Pool', value: String(pool), inline: true },
                { name: 'Arcanum', value: `${arcLabel} ${arcDots}`, inline: true },
            ],
            footerText: breakdown,
        });
        await postEmbedThenCommand(webhook, casterName, embed, `$cod ${pool}`);
    }

    return {
        postDiscord, arcanumColor,
        formatDiceCommand, formatParadoxCommand,
        buildEmbed, buildPoolSummaryFields,
        postEmbedThenCommand, postClash,
    };
})();

// Expose on window for Babel-compiled (function-scoped) page scripts.
if (typeof window !== 'undefined') window.DiscordShared = DiscordShared;
