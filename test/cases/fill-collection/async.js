module.exports = () =>
  new Promise((resolve) =>
    setTimeout(() => {
      resolve([{ title: "1 async", content: "2 async", link: "/link/async" }]);
    }, 100)
  );
