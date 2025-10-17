export default function ExportButtons() {
  const exportClient = () => {
    alert('Client PDF export coming soon')
  }
  const exportTrainer = () => {
    alert('Trainer detailed PDF export coming soon')
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="px-3 py-2 rounded bg-[#3FAE52] text-white" onClick={exportClient}>Export Client PDF</button>
      <button type="button" className="px-3 py-2 rounded border" onClick={exportTrainer}>Export Trainer PDF</button>
    </div>
  )
}
