CREATE FUNCTION staff_role_capabilities(role_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE role_name
 WHEN 'ORGANIZER_MANAGER' THEN ARRAY['event.read','event.edit','scanner.read','scanner.checkin','attendees.read','attendees.export']
 WHEN 'ORGANIZER_DOOR' THEN ARRAY['scanner.read','scanner.checkin']
 WHEN 'ORGANIZER_FINANCE' THEN ARRAY['finance.read']
 WHEN 'ORGANIZER_SUPPORT' THEN ARRAY['attendees.read'] ELSE ARRAY[]::text[] END
$$;
ALTER TABLE organizer_staff ADD CONSTRAINT staff_capability_subset CHECK
 (cardinality(capabilities)>0 AND capabilities <@ staff_role_capabilities(role));
ALTER TABLE organizer_invites ADD CONSTRAINT invite_capability_subset CHECK
 (cardinality(capabilities)>0 AND capabilities <@ staff_role_capabilities(role));

CREATE FUNCTION security_can_event(actor_kind text,actor_id text,actor_version integer,ev text,cap text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
 SELECT 1 FROM organizer_events oe JOIN organizer_users owner ON owner.id=oe.organizer_id
 JOIN identity_accounts tenant ON tenant.kind='ORGANIZER' AND tenant.id=owner.id AND NOT tenant.disabled
 JOIN identity_accounts a ON a.kind=actor_kind AND a.id=actor_id AND a.version=actor_version AND NOT a.disabled
 JOIN identity_principals p ON p.kind=a.kind AND p.id=a.id AND p.active AND p.verified
 WHERE oe.event_id=ev AND owner.is_active AND owner.approved AND owner.verified
 AND ((actor_kind='ORGANIZER' AND actor_id=oe.organizer_id AND cap IN
 ('event.read','event.edit','scanner.read','scanner.checkin','attendees.read','attendees.export','finance.read','staff.manage','audit.read'))
 OR (actor_kind='BUYER' AND EXISTS (SELECT 1 FROM organizer_staff s
 WHERE s.organizer_id=oe.organizer_id AND s.buyer_id::text=actor_id AND s.revoked_at IS NULL
 AND cap=ANY(s.capabilities) AND cap=ANY(staff_role_capabilities(s.role))
 AND (s.event_ids IS NULL OR ev=ANY(s.event_ids))))))
$$;
