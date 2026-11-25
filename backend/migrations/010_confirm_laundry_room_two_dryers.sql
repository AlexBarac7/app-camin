UPDATE laundry_machines
SET technical_status = 'working'
WHERE room = '2' AND type = 'dryer' AND label IN ('1A', '2A')
  AND technical_status = 'unspecified';
