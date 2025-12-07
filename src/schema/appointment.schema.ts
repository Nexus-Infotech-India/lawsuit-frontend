import { z } from 'zod';

export const bookAppointmentSchema = z.object({
	body: z.object({
		lawyerId: z.string().min(1),
		scheduledAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }),
		durationMins: z.coerce.number().default(30),
		notes: z.string().optional(),
	}),
});

export const cancelAppointmentSchema = z.object({
	params: z.object({
		id: z.string().min(1),
	}),
});

export const availabilitySchema = z.object({
	body: z.object({
		lawyerId: z.string().min(1),
		date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }),
		options: z.object({
			durationMins: z.number().optional(),
			intervalMins: z.number().optional(),
			workHours: z.object({
				start: z.string(),
				end: z.string(),
			}).optional(),
			excludePastSlots: z.boolean().optional(),
			bufferMins: z.number().optional(),
			lunchBreak: z.object({
				start: z.string(),
				end: z.string(),
			}).optional(),
		}).optional(),
	}),
});

export const confirmPaymentSchema = z.object({
	body: z.object({
		appointmentId: z.string().min(1),
		razorpay_payment_id: z.string().min(1),
		razorpay_order_id: z.string().min(1),
		razorpay_signature: z.string().min(1),
	}),
});

export const updateAgreementUrlSchema = z.object({
  body: z.object({
	appointmentId: z.string().min(1),
	agreementUrl: z.string().url(),
  }),
});

export type UpdateAgreementUrlInput = z.infer<typeof updateAgreementUrlSchema>;

export default { bookAppointmentSchema, cancelAppointmentSchema, availabilitySchema, confirmPaymentSchema, updateAgreementUrlSchema };
