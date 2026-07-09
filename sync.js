const fs = require('fs');
const lp = fs.readFileSync('solver-service/app/routers/lp_router.py', 'utf8');
const nw = fs.readFileSync('solver-service/app/routers/networks_router.py', 'utf8');

const content = 'export const SOLVER_SOURCE_CODE = `\\n' + 
  lp.replace(/`/g, '\\\\`').replace(/\\$/g, '\\\\$') + '\\n\\n' + 
  nw.replace(/`/g, '\\\\`').replace(/\\$/g, '\\\\$') + '\\n`;\\n';

fs.mkdirSync('backend/src/constants', { recursive: true });
fs.writeFileSync('backend/src/constants/solverContext.ts', content);
