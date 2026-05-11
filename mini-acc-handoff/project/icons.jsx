/* Icon set — minimal SVG strokes */
const Icon = window.Icon || (({ name, size = 16 }) => {
  const s = size;
  const stroke = "currentColor";
  const props = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case 'home':    return <svg {...props}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>;
    case 'inbox':   return <svg {...props}><path d="M3 13h5l1 2h6l1-2h5"/><path d="M5 5h14v14H5z"/></svg>;
    case 'doc':     return <svg {...props}><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>;
    case 'magic':   return <svg {...props}><path d="M5 19 19 5"/><path d="M5 5h2M6 4v2M19 17v2M18 18h2M11 9l1-3 1 3 3 1-3 1-1 3-1-3-3-1z"/></svg>;
    case 'file':    return <svg {...props}><path d="M7 3h7l5 5v13H7z"/><path d="M9 13h8M9 17h6"/></svg>;
    case 'card':    return <svg {...props}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>;
    case 'layers':  return <svg {...props}><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5M3 18l9 5 9-5"/></svg>;
    case 'percent': return <svg {...props}><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="m6 18 12-12"/></svg>;
    case 'shield':  return <svg {...props}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>;
    case 'lock':    return <svg {...props}><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
    case 'gear':    return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case 'sun':     return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
    case 'moon':    return <svg {...props}><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>;
    case 'search':  return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'bell':    return <svg {...props}><path d="M18 16H6l1.5-2V11a4.5 4.5 0 0 1 9 0v3z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>;
    case 'plus':    return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow':   return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case 'check':   return <svg {...props}><path d="m5 12 5 5L20 7"/></svg>;
    case 'x':       return <svg {...props}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case 'upload':  return <svg {...props}><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>;
    case 'alert':   return <svg {...props}><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.01"/></svg>;
    case 'eye':     return <svg {...props}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'down':    return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case 'up':      return <svg {...props}><path d="m6 15 6-6 6 6"/></svg>;
    case 'sparkle': return <svg {...props}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case 'filter':  return <svg {...props}><path d="M4 5h16M7 12h10M10 19h4"/></svg>;
    case 'export':  return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8 12 3 7 8M12 3v13"/></svg>;
    case 'chart':   return <svg {...props}><path d="M4 19h16M7 16V9M12 16V5M17 16v-4"/></svg>;
    default: return null;
  }
});
window.Icon = Icon;
