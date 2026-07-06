update settlements s
set status = r.settlement_status
from requests r
where s.request_id = r.id
and r.settlement_status is not null
and s.status is distinct from r.settlement_status;
