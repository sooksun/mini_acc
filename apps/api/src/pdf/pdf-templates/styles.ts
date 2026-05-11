export function pdfStyles(primaryColor: string): string {
  return `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; font-family: 'IBM Plex Sans Thai', 'Sarabun', sans-serif; color: #1a1a1a; font-size: 9.5pt; line-height: 1.3; }
body { padding: 11mm 11mm 12mm 11mm; position: relative; }

.header { display: grid; grid-template-columns: 90px 1fr 90px; align-items: start; gap: 14px; }
.brand-mark { width: 80px; height: 80px; border: 1.5px solid ${primaryColor}; border-radius: 4px; display: grid; place-items: center; color: ${primaryColor}; font-weight: 700; font-size: 24pt; letter-spacing: 1.5px; padding: 4px; text-align: center; }
.brand-mark .sub { font-size: 6.5pt; font-weight: 500; margin-top: 2px; letter-spacing: 0; line-height: 1.1; }
.company-block { padding-top: 2px; }
.company-name-th { font-size: 17pt; font-weight: 700; letter-spacing: 0.2px; line-height: 1.1; }
.company-name-en { font-size: 15pt; font-weight: 700; color: #1a1a1a; letter-spacing: 0.2px; line-height: 1.1; margin-top: 2px; }
.company-line { font-size: 7.5pt; color: #444; margin-top: 2px; line-height: 1.3; }
.for-customer { border: 1px solid #444; border-radius: 4px; padding: 4px 10px; font-size: 9pt; text-align: center; align-self: start; justify-self: end; }

.title-box { margin-top: 10px; border: 1.5px solid ${primaryColor}; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 16pt; font-weight: 700; color: ${primaryColor}; }

.meta-grid { margin-top: 10px; display: grid; grid-template-columns: 1fr 200px; gap: 12px; font-size: 9pt; }
.meta-grid .field { display: grid; grid-template-columns: 65px 1fr; gap: 4px; align-items: baseline; margin-bottom: 2px; }
.meta-grid .label { color: #444; }
.meta-grid .value { border-bottom: 1px dotted #888; padding-bottom: 1px; min-height: 14px; }
.meta-right .field { grid-template-columns: 45px 1fr; }
.value strong { font-weight: 700; }

.branch-row { margin-top: 6px; display: flex; gap: 14px; align-items: center; font-size: 9pt; flex-wrap: wrap; }
.branch-row .field { display: grid; grid-template-columns: 105px 1fr; align-items: baseline; gap: 4px; }
.branch-row .checkbox { display: inline-grid; place-items: center; width: 13px; height: 13px; border: 1px solid #333; font-size: 9pt; font-weight: 700; line-height: 1; vertical-align: middle; }
.branch-row .checked { background: #333; color: #fff; }
.branch-row .branch-no { display: inline-block; min-width: 70px; border-bottom: 1px dotted #888; padding-bottom: 1px; margin-left: 4px; }

table.items { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
table.items thead th { background: ${primaryColor}; color: #fff; padding: 7px 6px; font-weight: 600; text-align: center; border: 1px solid ${primaryColor}; font-size: 9pt; }
table.items thead th.num { text-align: right; }
table.items tbody td { padding: 4.5px 6px; border: 1px solid #c8c8c8; vertical-align: top; }
table.items tbody td.num { text-align: right; font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; }
table.items tbody td.center { text-align: center; }
table.items tbody td.empty { color: transparent; }

.summary-grid { margin-top: 10px; display: grid; grid-template-columns: 1fr 240px; gap: 0; }
.amount-words { border: 1px solid #c8c8c8; padding: 8px 12px; font-size: 9.5pt; display: flex; align-items: center; gap: 8px; }
.amount-words .label { color: #555; font-weight: 500; }
.amount-words .value { font-weight: 600; }

table.summary { width: 100%; border-collapse: collapse; font-size: 9pt; }
table.summary td { padding: 5px 8px; border: 1px solid #c8c8c8; vertical-align: middle; }
table.summary td.label { color: #1a1a1a; line-height: 1.2; }
table.summary td.label .en { color: #888; font-size: 7.5pt; display: block; margin-top: 1px; }
table.summary td.value { text-align: right; font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; font-weight: 500; }
table.summary tr.grand td { background: ${primaryColor}; color: #fff; font-weight: 700; border-color: ${primaryColor}; }
table.summary tr.grand td.label .en { color: rgba(255,255,255,0.75); }

.notes { margin-top: 14px; font-size: 8.5pt; color: #444; }
.notes .h { font-weight: 600; color: #333; margin-bottom: 2px; }
.notes ol { margin: 0; padding-left: 16px; }
.notes li { margin-bottom: 1px; }

.received-note { margin-top: 14px; padding: 6px 10px; background: #f4f4f4; border: 1px solid #d0d0d0; font-size: 9pt; }

.signatures { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; font-size: 9pt; }
.sig-box { border-top: 1px dotted transparent; padding-top: 26px; }
.sig-box .line { border-bottom: 1px dotted #555; height: 1px; margin-bottom: 4px; }
.sig-box .label { text-align: center; }
.sig-box .date { display: grid; grid-template-columns: 40px 1fr; gap: 4px; margin-top: 6px; font-size: 8.5pt; color: #555; align-items: baseline; }
.sig-box .date .dline { border-bottom: 1px dotted #888; height: 12px; }
.sig-name { text-align: center; font-size: 8pt; color: #555; margin-top: 12px; }

.watermark {
  position: fixed; inset: 0; pointer-events: none;
  display: grid; place-items: center;
  font-size: 120pt; color: rgba(180, 30, 30, 0.18);
  font-weight: 800; letter-spacing: 12px;
  transform: rotate(-30deg); transform-origin: center;
}
`;
}
