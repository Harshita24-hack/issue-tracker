-- #1045: validations, merges and escalations are typed entries in the
-- issue's conversation too.
ALTER TYPE "CommentType" ADD VALUE IF NOT EXISTS 'validation';
ALTER TYPE "CommentType" ADD VALUE IF NOT EXISTS 'merge';
ALTER TYPE "CommentType" ADD VALUE IF NOT EXISTS 'escalation';
