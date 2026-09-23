import {cronJobs} from 'convex/server';
import {internal} from './_generated/api';

const crons = cronJobs();

crons.interval(
  'expire held calls',
  {minutes: 5},
  internal.held.expireStale,
  {}
);

export default crons;
