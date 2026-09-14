import express from "express";

const app = express();
const port = 4999;

app.get("/",(req,res) => {
    res.json({
        message:"Hello!"
    })
})

app.listen(port,() =>{
    console.log(`Server running at http://localhost:${port}`);
})