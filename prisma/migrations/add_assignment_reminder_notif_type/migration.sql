-- Split into its own migration: add_assignment_completion_tracking's partial
-- index literally references 'ASSIGNMENT_REMINDER' in a WHERE clause, and
-- Postgres won't let a new enum value be used in the same transaction that
-- adds it ("unsafe use of new value ... must be committed before they can be
-- used") - unlike the earlier MENTION value, which that migration never
-- referenced in an expression, just declared.
ALTER TYPE "NotifType" ADD VALUE 'ASSIGNMENT_REMINDER';
