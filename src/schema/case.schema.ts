import { z } from 'zod';

export const createCaseSchema = z.object({
  body: z.object({
    title: z.string().min(3),
    description: z.string(),
    category: z.string(),
    appointmentId: z.string(),
    clientId: z.string(),
  }),
});

export type CreateCasePayloadSchema = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    category: z.string().optional(),
  }),
});

export const addDocumentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    fileurl: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    size: z.coerce.number().optional(),
  }),
});

export const addTimelineSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ title: z.string().min(1), description: z.string().optional(), eventDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }), type: z.string().optional() }),
});

export const addHearingSchema = z.object({
  body: z.object({ date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }), court: z.string().optional(), judge: z.string().optional(), purpose: z.string().optional(), notes: z.string().optional() }),
});

export type AddHearingSchema = z.infer<typeof addHearingSchema>;

export const createTimelineEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  eventDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }),
  type: z.string(),
})

export type CreateTimelineEventSchema = z.infer<typeof createTimelineEventSchema>;

export default { createCaseSchema, updateCaseSchema, addDocumentSchema, addTimelineSchema, addHearingSchema, createTimelineEventSchema };