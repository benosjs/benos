import { z } from 'zod'

/** The flagship's Standard Schema validator; Valibot or ArkType work the same way. */
export const editSchema = z.object({
  name: z.string().trim().min(2, 'Names need at least two characters.'),
  ownerEmail: z.email('Enter a valid email address.'),
})
