var gulp = require("gulp");
var child_process = require('child_process');
var run = require('gulp-run');
var clean = require('gulp-clean');
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json");

gulp.task("build", function () {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest("./dist"));
});

gulp.task('clean', function(){
    return gulp.src(['./dist/*'], {read:false})
        .pipe(clean());
});

gulp.task("local", function () {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest("./dist"))
        .pipe(run('npm start dist/').exec());
});

gulp.task("run", function () {
    return tsProject.src()
        .pipe(tsProject())
        .pipe(run('npm start dist/').exec());
});