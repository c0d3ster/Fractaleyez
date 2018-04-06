export const EASINGS = 
{
  linear: (t) => t,
  cubicIn: (t) => t*t*t,
  cubicOut: (t) => (--t)*t*t+1
};