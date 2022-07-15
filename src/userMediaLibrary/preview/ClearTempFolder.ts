declare function require(data:any):any;
const fs = require('fs');
const path = require('path');

export class ClearTempFolder {
    
    private directory:string;
    
    constructor(directory:string) {
        this.directory = directory;
    }

    public execute():void{
        fs.readdir(this.directory, (err, files) => {
            if (err) throw err;

            for (const file of files) {
                fs.unlink(path.join(this.directory, file), err => {
                    if (err) throw err;
                });
            }
        });
    }
}