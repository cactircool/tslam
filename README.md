# tslam

what's up gang? back again with another craaazy project!

I'm sure you don't really care how it works, so here's how to get it up and running:

## For testing (to see if it actually works):

Run from the project directory:

```sh
scripts/local-setup.sh
```

This should have it up and running if you go to http://localhost:80, and let you see how the app works.

## 1. Buy a domain (cloudflare is nice) + buy an UBUNTU server (ideally with a public ipv4 address)

think amazon EC2 or azure something or other

## 2. Route your domain to the server through an A DNS Certificate

## 3. Now you're ready for me to do all the heavy lifting:

Simply clone this project, and then run (FROM THE PROJECT DIRECTORY (the directory you cloned the repo into))

```sh
scripts/prod-setup.sh
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

## Slack workspace setup:

This website follows an admin + member workflow where an admin creates a "workspace" and members can join that workspace to see all the snapshots. The admin can take snapshots/set an interval in which the snapshots should take place.

For the snapshots to work correctly, the website will ask the admin for a bot token. The admin needs to invite a bot into all the channels they want in the archives:

```
/invite @<BOT_NAME>
```

Keep in mind this bot will need read access to channels (and files and ims, depends on what all you want archived). No other information is really needed.

For members to join a workspace, you just have to search up the admin's username under the `Find & Join` tab, from which you can choose which of that admin's workspaces you want to join. Then the admin can accept or deny that request.

## Disclaimer!

All UI is very blatantly AI slop + a decent amount of logic is cuz I got lazy having to jump through boilerplate hoops so I just told it what to do and it did it. I know exactly how everything works tho, trust!
