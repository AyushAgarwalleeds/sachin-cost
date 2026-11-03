import {buildContours,extractJobs} from './geometry.js';

// Plot exports can round endpoints independently. This tolerance is in paper mm.
export const PDF_JOIN_TOLERANCE=.08;

export function suggestPdfOutline(curves){
  const {contours}=buildContours(curves,PDF_JOIN_TOLERANCE);
  const closed=contours.filter(contour=>contour.closed&&!contour.branched);
  const largest=extractJobs(closed).sort((a,b)=>b.contours[0].area-a.contours[0].area)[0];
  return largest?.curves.map(curve=>curve.id)||[];
}
