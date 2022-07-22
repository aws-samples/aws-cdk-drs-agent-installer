# aws-cdk-drs-agent-installer

## Overview

This project provides a set of examples for installing the [AWS Elastic Disaster Recover](https://aws.amazon.com/disaster-recovery/) agent to EC2 instances within an AWS environment

The project consists of two stacks;

### [drs-agent-installer](./lib/infrastructure/stacks/DrsAgentInstallerStack.ts)
This stack deploys an [SSM Association](./lib/infrastructure/stacks/DrsAgentInstallerStack.ts#L120) which will run an [SSM Document](./lib/infrastructure/stacks/DrsAgentInstallerStack.ts#L99) that installs the DRS agent on EC2 instances that match a specified tag. 
The stack also deploys associated roles and an S3 bucket for logging the installation process. 
The EC2 instance role will need to be specified in the stacks ['assumeDrsRolePrincipals'](./bin/app.ts#L32) property so that it has permissions to assume the 'drs-installation-role'.

---

## Rescan on volume attachment

When a volumes is attached to an EC2 instance the DRS agent must be reinstalled to force the new volume to be scanned by the agent. 
Below are two different methods for tracking the attachment of volumes.

### [check-volumes script](./lib/infrastructure/stacks/DrsAgentInstallerStack.ts#L62)
The dr-agent-installer stack can be configured to install a bash script and cron job on the target EC2 instances. 
This script monitors the instance for new volumes being added and initiates a re-installation of the DRS agent to force the new volume to be scanned.  

### [on-attach-volume-event](./lib/infrastructure/stacks/OnVolumeAttachEventStack.ts)


The architecture below is uses EventBridge to listen for EC2 AttachVolume api calls via CloudTrail logs and then invokes a lambda function ([on-volume-attach-event-handler](./lib/runtime/on-volume-attach-event.ts)). 
This function checks that the tags on the EC2 instance match specific tags. If so the lambda invokes the SSM Document to reinstall the drs agent on that specific instance.

The stack can be configured to create a new trail and bucket (which will add additional [cost](https://aws.amazon.com/cloudtrail/pricing/#Pricing)). You can also point at an existing S3 bucket used for storing CloudTrail logs but the lambda will need to have read permissions for this bucket in order to work.
![on-attach-volume-event architecture diagram](./images/OnAttachVolumeEvent.drawio.png)

## Deployment

### Prerequisites
* [CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install)
* An AWS account with a [CDK bootstrapped environment](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_bootstrap) 

### Installing the stacks
* `npm run build`
* `cdk synth`
* `cdk  deploy --all`


