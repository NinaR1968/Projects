// Loads the fixed JSON files once per page.
const cache = new Map();

function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`failed to load ${path}`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export const getLists = () => load('data/lists.json');
export const getFoods = () => load('data/demo/foods-sample.json');
export const getExercises = () => load('data/demo/exercises-sample.json');
export const getMenus = () => load('data/demo/menus.json');
export const getPlans = () => load('data/demo/plans.json');
export const getSummaries = () => load('data/demo/summaries.json');
export const getSeed = () => load('data/demo/seed.json');

export const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
export const labelOf = (list, code) => list.find((x) => x.code === code)?.label ?? code;
