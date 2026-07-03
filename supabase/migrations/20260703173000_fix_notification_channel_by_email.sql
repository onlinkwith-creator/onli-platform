-- Create a trigger function to automatically set the notification channel
CREATE OR REPLACE FUNCTION enforce_notification_channel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.recipient_email IS NOT NULL AND trim(NEW.recipient_email) <> '' THEN
    NEW.channel := 'email';
  ELSE
    NEW.channel := 'internal';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the notifications table
DROP TRIGGER IF EXISTS trg_enforce_notification_channel ON notifications;
CREATE TRIGGER trg_enforce_notification_channel
BEFORE INSERT OR UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION enforce_notification_channel();

-- Backfill: Fix existing internal notifications that actually have an email
UPDATE notifications
SET channel = 'email'
WHERE channel = 'internal' 
  AND recipient_email IS NOT NULL 
  AND trim(recipient_email) <> '';
