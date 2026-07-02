// Narration for the Launch Tour (the landing "Watch demo" video).
// `at` = seconds into the 80s timeline when the line should start (each scene's
// start). The generator (scripts/gen-narration.mjs) turns `text` into a per-line
// MP3 at public/tour-vo/<id>.mp3 via Sarvam AI; the tour plays each clip when the
// timeline crosses its `at`. Keep `id` two-digit and stable — it names the file.
export const TOUR_NARRATION = [
  { id: '01', at: 0.2,  text: "TaskFlowCo. Stop juggling — start flowing. One calm workspace for your entire practice." },
  { id: '02', at: 5.2,  text: "Today your work is scattered across spreadsheets, WhatsApp, email and sticky notes — and deadlines slip through the cracks." },
  { id: '03', at: 12.2, text: "TaskFlowCo brings every client task into one place — GST returns, TDS, audits, ROC filings — each with an owner, a due date, and a status you can trust." },
  { id: '04', at: 22.2, text: "See your work the way you think. Switch between a task list, a Kanban board, a calendar, or a grid — all from the same live data." },
  { id: '05', at: 32.2, text: "A workload heatmap shows exactly where the pressure is, so you can balance your team before deadlines pile up." },
  { id: '06', at: 40.2, text: "Chase documents and payments automatically — reminders reach your clients over email, right on time." },
  { id: '07', at: 46.2, text: "Keep your SOPs, checklists and login credentials in one secure, encrypted library." },
  { id: '08', at: 52.2, text: "Revenue, realization and pending work — the health of your firm, at a glance." },
  { id: '09', at: 58.2, text: "Turn a proposal into an invoice into a payment — billing that flows straight from the work you deliver." },
  { id: '10', at: 66.2, text: "Spin up Kanban workspaces for any team or project, in seconds." },
  { id: '11', at: 72.2, text: "Every filing, deadline and client — in one place. TaskFlowCo — start free, and run your practice with total clarity." },
]

// Public path of a line's generated audio.
export const narrationSrc = (id) => '/tour-vo/' + id + '.mp3'
