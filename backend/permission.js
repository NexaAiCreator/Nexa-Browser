module.exports = {
  request: (scope) => {
    console.log(`Permission request for: ${scope}`);
    return { status: 'granted', scope };
  }
};
