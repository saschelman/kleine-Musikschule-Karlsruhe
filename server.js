const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const port = process.env.PORT || 3000;
const baseDir = __dirname;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".json": "application/json",
};

http
  .createServer((req, res) => {
    try {
      const parsed = new URL(req.url, `http://localhost:${port}`);

      // API: Google Reviews proxy
      if (parsed.pathname === "/api/google-reviews") {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        const placeId = process.env.GOOGLE_PLACE_ID;

        if (!apiKey || !placeId) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "Server not configured. Please set GOOGLE_MAPS_API_KEY and GOOGLE_PLACE_ID environment variables.",
            })
          );
          return;
        }

        const fields = "rating,user_ratings_total,reviews";
        const params = new URLSearchParams({
          place_id: placeId,
          fields,
          key: apiKey,
          reviews_no_translations: "true",
          reviews_sort: "newest",
        }).toString();

        const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;

        https
          .get(apiUrl, (apiRes) => {
            let data = "";
            apiRes.on("data", (chunk) => (data += chunk));
            apiRes.on("end", () => {
              try {
                const json = JSON.parse(data);
                if (json.status !== "OK" || !json.result) {
                  res.writeHead(502, { "Content-Type": "application/json" });
                  res.end(
                    JSON.stringify({
                      error: "Failed to fetch from Google Places",
                      status: json.status,
                      details: json.error_message,
                    })
                  );
                  return;
                }

                const result = json.result;
                const simplified = {
                  rating: result.rating || null,
                  total: result.user_ratings_total || 0,
                  reviews: Array.isArray(result.reviews)
                    ? result.reviews.slice(0, 10).map((r) => ({
                        author: r.author_name,
                        rating: r.rating,
                        text: r.text,
                        time: r.relative_time_description,
                      }))
                    : [],
                };

                res.writeHead(200, {
                  "Content-Type": "application/json",
                  "Cache-Control": "public, max-age=900",
                });
                res.end(JSON.stringify(simplified));
              } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: "Invalid response from Google",
                    details: e.message,
                  })
                );
              }
            });
          })
          .on("error", (err) => {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Request to Google failed",
                details: err.message,
              })
            );
          });

        return;
      }

      // Static file handling
      const filePath = path.join(
        baseDir,
        parsed.pathname === "/" ? "index.html" : parsed.pathname
      );
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server error");
    }
  })
  .listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
