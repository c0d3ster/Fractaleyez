/**
 * Which orbit particle systems can share one geometry. A system is one Points object per (level, subset), listed level by level
 * (`index = level * layers + subset`). Systems of the same subset hold the same particle positions, differing only in depth, so they
 * can share a position buffer, as long as they are always reshaped together.
 *
 * Switcheroo reshapes only the systems at even indexes on a beat (`isReshapedOnBeat`), so systems at odd indexes keep an older shape
 * until the next full rebuild. A group is therefore a subset plus the parity of the index: with an even layer count that is every
 * level of a subset (one buffer per subset), with an odd count it is every second level (two per subset). No group ever mixes a system
 * that is reshaped with one that is not, so sharing changes nothing about what Switcheroo does.
 */
export const isReshapedOnBeat = (objectIndex: number): boolean => objectIndex % 2 === 0

/** A number that is the same for systems that share a geometry. */
export const geometryGroup = (subset: number, objectIndex: number): number => subset * 2 + (isReshapedOnBeat(objectIndex) ? 0 : 1)

/** How many geometries a particle config needs (it was `levels * layers`, one for every system). */
export const geometryGroupCount = (levels: number, layers: number): number => {
  const groups = new Set<number>()
  for (let level = 0; level < levels; level++) {
    for (let subset = 0; subset < layers; subset++) groups.add(geometryGroup(subset, level * layers + subset))
  }
  return groups.size
}
