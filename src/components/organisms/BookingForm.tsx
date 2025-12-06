import { FC, useState } from 'react'
import Button from '@/components/atoms/Button'

interface BookingFormProps {
  lawyerId: string
  onBooked: (appointmentId: string) => void
}

const BookingForm: FC<BookingFormProps> = ({ lawyerId, onBooked }) => {
  const [selectedDate, setSelectedDate] = useState<string>('')

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Book Consultation</h2>
      {/* Date/time picker and booking form will be implemented here */}
      <Button onClick={() => {}}>
        Proceed to Payment
      </Button>
    </div>
  )
}

export default BookingForm