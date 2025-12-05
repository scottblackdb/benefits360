export const selector = <T>() => ({
  query: {
    select: (data: T) => data,
  },
});

export default selector;
