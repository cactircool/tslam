# tslam

what's up gang? back again with another craaazy project!

I'm sure you don't really care how it works, so here's how to get it up and running:

## 1. Buy a domain (cloudflare is nice) + buy an UBUNTU server (ideally with a public ipv4 address)

think amazon EC2 or azure something or other

## 2. Route your domain to the server through an A DNS Certificate

## 3. Now you're ready for me to do all the heavy lifting:

Simply clone this project, and then run (FROM THE PROJECT DIRECTORY (the directory you cloned the repo into))

```sh
scripts/init.sh
```

## 4. Wow! You're done!

Your service is running under the name `tslam` and can be modified through systemd or systemctl. Some useful commands include:

```sh
sudo systemctl stop tslam
sudo systemctl start tslam
sudo systemctl restart tslam
sudo systemctl status tslam
sudo journalctl -xeu tslam # to see logs if something goes horribly wrong
```

## Disclaimer!

All UI is very blatantly AI slop + a decent amount of logic is cuz I got lazy having to jump through boilerplate hoops so I just told it what to do and it did it. I know exactly how everything works tho, trust!
