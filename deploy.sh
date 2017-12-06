#!/bin/bash

aws --profile gunbro cloudformation package --template-file template.yaml    --output-template-file serverless-output.yaml    --s3-bucket cicdsample.appcohesion.io
aws --profile gunbro cloudformation deploy    --template-file serverless-output.yaml    --stack-name cicdaddpermissions   --capabilities CAPABILITY_IAM