import { bearing, distanceM, Path } from "./geo";

describe("geo", () => {
  it("measures great-circle distance", () => {
    // One degree of latitude is about 111.2 km.
    expect(distanceM([10, 45], [10, 46]) / 1000).toBeCloseTo(111.2, 1);
  });

  it("computes compass bearings", () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0);
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90);
    expect(bearing([0, 0], [-1, 0])).toBeCloseTo(270);
  });

  it("walks along a path", () => {
    const path = new Path([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    const leg = distanceM([0, 0], [0, 1]);

    expect(path.at(0)).toEqual({ point: [0, 0], heading: 0 });
    expect(path.at(leg / 2).point[1]).toBeCloseTo(0.5);
    const onSecondLeg = path.at(leg + 1000);
    expect(onSecondLeg.point[1]).toBe(1);
    expect(onSecondLeg.heading).toBeCloseTo(90, 0);
    // Past the end clamps to the last point.
    expect(path.at(path.lengthM * 2).point).toEqual([1, 1]);
  });

  it("locates a point along a path", () => {
    const path = new Path([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    const leg = distanceM([0, 0], [0, 1]);

    expect(path.locate([0, 0])).toMatchObject({ alongM: 0, index: 0, point: [0, 0] });
    const middle = path.locate([0.001, 0.5]);
    expect(middle.alongM / leg).toBeCloseTo(0.5, 3);
    expect(middle).toMatchObject({ index: 0, point: [0, 0.5] });
    expect(path.locate([0.5, 1.001])).toMatchObject({ index: 1 });
    expect(path.locate([2, 1])).toMatchObject({ alongM: path.lengthM, index: 1, point: [1, 1] });
  });

  it("prefers the earlier pass of an out-and-back path", () => {
    const path = new Path([
      [0, 0],
      [0, 0.1],
      [0, 0],
    ]);
    expect(path.locate([0, 0.05]).index).toBe(0);
  });
});
