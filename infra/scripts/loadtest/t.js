// INFRA-12: k6 ramp used to compare boxes (x86 sandbox on 2026-10-27, A1 on 2026-11-02). Read-only and anonymous.
//
//   k6 run -e TARGET_PATH=/api/reference/countries t.js
//
// Shape: 2 users for 15 s, then for each of 10, 50, 100, 200 and 400 users a 10 s ramp and a 40 s hold, then a 10 s
// ramp-down. The run aborts if more than 5% of the requests fail. Users send requests without pauses, so the numbers
// are a ceiling, not a count of real users. The host name is mapped to the box itself (`hosts`), so the test goes
// through Caddy and TLS exactly as a visitor does, while DNS can still point at another box.
import http from 'k6/http'
import { check } from 'k6'

const HOST = __ENV.TARGET_HOST || 'yoursport.vn'
const TARGET_IP = __ENV.TARGET_IP || '127.0.0.1'
const PATH = __ENV.TARGET_PATH || '/api/reference/countries'

const steps = []
for (const users of [10, 50, 100, 200, 400]) {
  steps.push({ duration: '10s', target: users })
  steps.push({ duration: '40s', target: users })
}

export const options = {
  hosts: { [HOST]: TARGET_IP },
  stages: [{ duration: '15s', target: 2 }, ...steps, { duration: '10s', target: 0 }],
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '20s' }],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
}

export default function () {
  const res = http.get(`https://${HOST}${PATH}`)
  check(res, { 'status is 200': (r) => r.status === 200 })
}
