CREATE OR REPLACE FUNCTION enforce_device_group_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  max_allowed INTEGER;
  current_count INTEGER;
BEGIN
  SELECT max_clients INTO max_allowed
    FROM device_groups
   WHERE id = NEW.group_id
   FOR UPDATE;

  IF max_allowed IS NULL THEN
    RAISE EXCEPTION 'group does not exist';
  END IF;

  SELECT COUNT(*) INTO current_count
    FROM device_group_members
   WHERE group_id = NEW.group_id;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'group has reached its client limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS device_group_capacity_trigger ON device_group_members;

CREATE TRIGGER device_group_capacity_trigger
BEFORE INSERT ON device_group_members
FOR EACH ROW
EXECUTE FUNCTION enforce_device_group_capacity();
