// The output schema sent to the model (ARCHITECTURE 5.3). Valid ids are checked in code, not as an enum.
// The model plans only the 5 strength categories; the code adds aerobic (ADR-5). summary_text is added in M6.
export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    menu: {
      type: 'object',
      properties: {
        meals: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              slot: { type: 'string', enum: ['breakfast', 'snack_1', 'lunch', 'snack_2', 'dinner'] },
              items: {
                type: 'array',
                minItems: 1,
                maxItems: 8,
                items: {
                  type: 'object',
                  properties: {
                    food_id: { type: 'string' },
                    grams: { type: 'integer', minimum: 5, maximum: 800 },
                  },
                  required: ['food_id', 'grams'],
                },
              },
            },
            required: ['slot', 'items'],
          },
        },
      },
      required: ['meals'],
    },
    training_plan: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['legs', 'arms', 'abs', 'shoulders', 'back'] },
              exercises: {
                type: 'array',
                minItems: 1,
                maxItems: 6,
                items: {
                  type: 'object',
                  properties: {
                    exercise_id: { type: 'string' },
                    sets: { type: 'integer', minimum: 1, maximum: 10 },
                    reps: { type: 'integer', minimum: 1, maximum: 60 },
                  },
                  required: ['exercise_id', 'sets', 'reps'],
                },
              },
            },
            required: ['category', 'exercises'],
          },
        },
      },
      required: ['categories'],
    },
  },
  required: ['menu', 'training_plan'],
};
