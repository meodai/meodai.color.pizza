export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = "meodai.color.pizza";
    return Response.redirect(url, 301);
  },
};
