import { FC, useState } from 'react'
import Modal from './Modal'
import UploadInput from './UploadButton'
import { appointmentsApi } from '@/services/api'

interface Props {
  id: string
  lawyerName?: string
  clientName?: string
  datetime: string
  status?: string
  onAttend?: () => void
  onCancel?: () => void
  onReschedule?: () => void
  onConnect?: () => void
  onAgreement?: () => void
  onDiscussion?: () => void
  onCaseDetails?: () => void
}

const AppointmentItem: FC<Props> = ({ id, lawyerName, clientName, datetime, status, onAttend, onCancel, onReschedule, onConnect, onAgreement, onDiscussion, onCaseDetails }) => {
  const displayName = clientName ?? lawyerName ?? `Lawyer ${id}`
  const s = (status || '').toUpperCase()
  const [open, setOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!imageUrl) {
        alert("Please upload an agreement file before submitting.");
        return;
    };
    appointmentsApi.updateAgreementUrl({
        body: {
            appointmentId: id,
            agreementUrl: imageUrl,
        }
    })
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-100">
      {/* Top Row: Name (left), Time + Status (right) */}
      <div className="flex justify-between items-start mb-3">
        <div className="font-semibold text-midnight">{displayName}</div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">{new Date(datetime).toLocaleString()}</div>
          {s && (
            <span className={`px-2 py-1 text-xs font-semibold rounded ${s === 'CANCELLED' ? 'bg-red-100 text-red-700' : s === 'COMPLETED' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
              {s}
            </span>
          )}
        </div>
      </div>

      <Modal open={open}>
        <div className='min-w-[300px]'>
            <button
            onClick={() => {
                setOpen(false)
            }}
            >cancel</button>
          <UploadInput imageUrl={imageUrl} setImageUrl={setImageUrl} />
          <button onClick={handleSubmit}>submit</button>
        </div>
    </Modal>

      {/* Horizontal Line */}
      <hr className="border-gray-200 mb-3" />

      {/* Bottom Row: Action Buttons depending on status */}
      <div>
        {s === 'CONFIRMED' && (
          <div className="flex gap-4 text-sm justify-around">
            <button onClick={onReschedule} className="text-yellow-600 font-medium hover:underline">Reschedule</button>
            <button onClick={onConnect} className="text-green-600 font-medium hover:underline">Connect</button>
            {onCancel && <button onClick={onCancel} className="text-red-600 font-medium hover:underline">Cancel</button>}
          </div>
        )}

        {s === 'COMPLETED' && (
          <div className="flex gap-6 text-sm justify-around">
            <button onClick={() => {setOpen(true)}} className="text-pink-600 font-medium hover:underline">Agreement</button>
            <button onClick={onDiscussion} className="text-blue-400 font-medium hover:underline">Discussion</button>
            <button onClick={onCaseDetails} className="text-green-500 font-medium hover:underline">Case Details</button>
          </div>
        )}

        {/* Fallback actions: show Attend/Cancel if provided */}
        {s !== 'CONFIRMED' && s !== 'COMPLETED' && (
          <div className="flex gap-2">
            {onAttend && (
              <button onClick={onAttend} className="px-3 py-1 bg-green-600 text-white text-sm rounded">Attend</button>
            )}
            {onCancel && (
              <button onClick={onCancel} className="px-3 py-1 border border-red-300 text-red-600 text-sm rounded">Cancel</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AppointmentItem
