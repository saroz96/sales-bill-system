# 1?? Use an official Node.js image 
FROM node:18 
 
# 2?? Set the working directory inside the container 
WORKDIR /app 
 
# 3?? Copy package.json and package-lock.json first to install dependencies 
COPY package*.json ./ 
 
# 4?? Install dependencies 
RUN npm install 

# Copy .env file
COPY .env ./
 
# 5?? Copy all project files 
COPY . . 
 
# 6?? Expose the port the app runs on 
EXPOSE 3000 
 
# 7?? Start the application 
CMD ["node", "app.js"] 
