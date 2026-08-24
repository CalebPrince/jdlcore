// JDL Core — sample support chat widget.
// DEMO ONLY: scripted menu-driven responder, no AI, no backend. Modeled on
// the chat pattern in the abyshub project (scripted-responder + handoff),
// reimplemented in plain JS since this site has no build step. Meant to
// show a prospective client what menu-driven support + human handoff could
// look like — swap `respond()` for a real backend before relying on it.

(function () {
  const ASSISTANT_NAME = 'JDL Core Assistant';

  const MAIN_MENU = [
    'Our Services',
    'Request an Inspection',
    'How It Works',
    'Track My Request',
    'Talk to a Person',
  ];

  const GREETING = {
    text: "Hi, I'm the " + ASSISTANT_NAME + " — a sample assistant previewing what site support could look like. Ask a question, or pick an option below.",
    quickReplies: MAIN_MENU,
  };

  const SERVICES = [
    'Stock Monitoring', 'Collateral Verification', 'Tank & Depot Inspections',
    'Quantity Verification', 'Reconciliation & Exception Reporting',
    'Loading & Discharge Supervision', 'Inventory Audit Support',
    'Loss & Discrepancy Investigation', 'Documentation & Reporting',
    'Stock Control Advisory',
  ];

  const rules = [
    {
      id: 'services',
      test: /service|offer|what do you do|inspect/i,
      reply: () => ({
        text: 'We provide ten inspection and verification services: ' + SERVICES.join(', ') + '.',
        quickReplies: ['Request an Inspection', 'How It Works', 'Talk to a Person'],
      }),
    },
    {
      id: 'request',
      test: /request|quote|price|pricing|cost|book|hire/i,
      reply: () => ({
        text: "You can submit a request with job details on our quote form and we'll follow up to confirm scope and pricing.",
        quickReplies: [{ label: 'Open Request Form', href: 'inspection.html#quote' }, 'How It Works', 'Talk to a Person'],
      }),
    },
    {
      id: 'process',
      test: /how.*work|process|steps|turnaround/i,
      reply: () => ({
        text: 'Six steps: Request → Assignment → Inspection → Verification → Review → Report. Every job follows the same process.',
        quickReplies: ['Request an Inspection', 'Talk to a Person'],
      }),
    },
    {
      id: 'track',
      test: /track|status|portal|dashboard|invoice/i,
      reply: () => ({
        text: 'A client portal for tracking requests, reports and invoices is in development. For now, our team can update you directly.',
        quickReplies: ['Talk to a Person', 'Our Services'],
      }),
    },
    {
      id: 'analytics',
      test: /analytics|chatbot|industry data/i,
      reply: () => ({
        text: 'JDL Core Analytics — a subscription assistant for industry data — is coming soon.',
        quickReplies: [{ label: 'Preview Analytics', href: 'analytics.html' }, 'Our Services'],
      }),
    },
    {
      id: 'academy',
      test: /academy|course|tutorial|training|learn|practice test/i,
      reply: () => ({
        text: 'JDL Core Academy — tutorials and practice tests for the oil & gas value chain — is coming soon.',
        quickReplies: [{ label: 'Preview Academy', href: 'academy.html' }, 'Our Services'],
      }),
    },
    {
      id: 'human',
      test: /human|person|agent|talk|call|contact|speak|complain/i,
      reply: () => ({
        text: 'Sure — here are two ways to reach the team.',
        handoff: true,
      }),
    },
    {
      id: 'thanks',
      test: /thanks|thank you|cheers/i,
      reply: () => ({ text: 'Any time — anything else I can help with?', quickReplies: MAIN_MENU }),
    },
    {
      id: 'greeting',
      test: /^(hi|hey|hello|good (morning|afternoon|evening))\b/i,
      reply: () => ({ text: 'Hello — what can I help with?', quickReplies: MAIN_MENU }),
    },
  ];

  function respond(input) {
    const text = input.trim();
    if (!text) return { text: 'Try one of the options below.', quickReplies: MAIN_MENU };
    for (const rule of rules) {
      if (rule.test.test(text)) return rule.reply();
    }
    return {
      text: "I didn't quite catch that. Try one of the options below, or talk to a person.",
      quickReplies: MAIN_MENU,
    };
  }

  const WIDGET_HTML = `
    <button type="button" class="chat-launcher" id="chat-launcher" aria-expanded="false" aria-controls="chat-panel" aria-label="Chat with ${ASSISTANT_NAME}">
      <svg class="chat-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>
      <svg class="chat-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>

    <div class="chat-panel" id="chat-panel" role="dialog" aria-label="Chat with ${ASSISTANT_NAME}" aria-hidden="true">
      <header class="chat-header">
        <span class="chat-avatar" aria-hidden="true">JC</span>
        <div class="chat-header-text">
          <p class="chat-title">${ASSISTANT_NAME}</p>
          <p class="chat-subtitle"><span class="chat-dot"></span>Sample assistant &mdash; demo only</p>
        </div>
        <button type="button" class="chat-close" id="chat-close" aria-label="Close chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </header>

      <div class="chat-log" id="chat-log" role="log"></div>

      <form class="chat-composer" id="chat-composer">
        <input type="text" id="chat-input" placeholder="Ask something…" aria-label="Your message" autocomplete="off">
        <button type="submit" class="chat-send" aria-label="Send message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8-8-2Z"/></svg>
        </button>
      </form>
      <p class="chat-footer">Powered by <a href="https://princecaleb.dev" target="_blank" rel="noopener">princecaleb.dev</a></p>
    </div>
  `;

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function bubble(role, text) {
    const b = document.createElement('div');
    b.className = 'chat-bubble ' + role;
    b.textContent = text;
    return b;
  }

  function quickReplyRow(items, onPick) {
    const row = document.createElement('div');
    row.className = 'chat-quick-replies';
    items.forEach((item) => {
      const isLink = typeof item === 'object';
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chat-chip';
      chip.textContent = isLink ? item.label : item;
      chip.addEventListener('click', () => onPick(item));
      row.appendChild(chip);
    });
    return row;
  }

  function typingIndicator() {
    const t = document.createElement('div');
    t.className = 'chat-bubble assistant chat-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    return t;
  }

  function handoffPanel(log, onClose) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-handoff';
    wrap.innerHTML = `
      <a class="btn btn-primary" href="tel:+000000000000" style="width:100%;">Call the Team (placeholder)</a>
      <p class="chat-handoff-divider">or leave your details</p>
      <form class="chat-handoff-form">
        <input type="text" name="name" placeholder="Your name" required>
        <input type="text" name="contact" placeholder="Phone or email" required>
        <textarea name="note" rows="2" placeholder="Anything to add (optional)"></textarea>
        <div class="chat-handoff-actions">
          <button type="submit" class="btn btn-primary btn-sm">Send</button>
          <button type="button" class="btn btn-ghost btn-sm chat-handoff-cancel">Cancel</button>
        </div>
        <p class="chat-handoff-note" role="status" aria-live="polite"></p>
      </form>
    `;
    wrap.querySelector('.chat-handoff-cancel').addEventListener('click', () => {
      wrap.remove();
      onClose();
    });
    wrap.querySelector('.chat-handoff-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const note = wrap.querySelector('.chat-handoff-note');
      note.textContent = "Thanks — this demo doesn't send anywhere yet. Wire it to a real inbox before launch.";
      wrap.querySelector('.chat-handoff-form').reset();
    });
    log.appendChild(wrap);
    return wrap;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', WIDGET_HTML);

    const launcher = document.getElementById('chat-launcher');
    const panel = document.getElementById('chat-panel');
    const log = document.getElementById('chat-log');
    const composer = document.getElementById('chat-composer');
    const input = document.getElementById('chat-input');
    const closeBtn = document.getElementById('chat-close');

    let opened = false;

    function scrollToEnd() {
      log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    }

    function addAssistantTurn(reply) {
      if (reply.text) log.appendChild(bubble('assistant', reply.text));
      if (reply.handoff) {
        handoffPanel(log, scrollToEnd);
      } else if (reply.quickReplies) {
        log.appendChild(quickReplyRow(reply.quickReplies, handlePick));
      }
      scrollToEnd();
    }

    function handlePick(item) {
      if (typeof item === 'object' && item.href) {
        window.location.href = item.href;
        return;
      }
      sendMessage(item);
    }

    function sendMessage(text) {
      const clean = String(text).trim();
      if (!clean) return;
      log.appendChild(bubble('user', clean));
      scrollToEnd();
      const typing = typingIndicator();
      log.appendChild(typing);
      scrollToEnd();
      setTimeout(() => {
        typing.remove();
        addAssistantTurn(respond(clean));
      }, 420);
    }

    function openPanel() {
      opened = true;
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      launcher.setAttribute('aria-expanded', 'true');
      launcher.classList.add('is-open');
      if (!log.hasChildNodes()) addAssistantTurn(GREETING);
      setTimeout(() => input.focus(), 150);
    }

    function closePanel() {
      opened = false;
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      launcher.setAttribute('aria-expanded', 'false');
      launcher.classList.remove('is-open');
    }

    launcher.addEventListener('click', () => (opened ? closePanel() : openPanel()));
    closeBtn.addEventListener('click', closePanel);
    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage(input.value);
      input.value = '';
    });
  });
})();
